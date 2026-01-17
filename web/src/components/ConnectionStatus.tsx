interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  const statusConfig = {
    connecting: { color: 'bg-yellow-500', text: 'Connecting...' },
    connected: { color: 'bg-green-500', text: 'Connected' },
    disconnected: { color: 'bg-gray-500', text: 'Disconnected' },
    failed: { color: 'bg-red-500', text: 'Connection Failed' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm text-gray-400">{config.text}</span>
    </div>
  );
}
