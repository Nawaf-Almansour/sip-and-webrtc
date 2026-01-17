export interface MediaConstraints {
  audio: boolean;
  video: boolean;
}

export class MediaManager {
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  async getLocalStream(constraints: MediaConstraints = { audio: true, video: true }): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error('Failed to get local media:', error);
      throw error;
    }
  }

  setRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  async toggleAudio(enabled: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async toggleVideo(enabled: boolean): Promise<void> {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    if (videoDevices.length < 2) return;

    const currentDeviceId = videoTrack.getSettings().deviceId;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextDevice.deviceId } },
      audio: false,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newVideoTrack);
    videoTrack.stop();
  }

  async getScreenShare(): Promise<MediaStream> {
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  stopRemoteStream(): void {
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
  }

  cleanup(): void {
    this.stopLocalStream();
    this.stopRemoteStream();
  }
}

export const mediaManager = new MediaManager();
