declare module 'drachtio-srf' {
  export default class Srf {
    connect(opts: { host: string; port: number; secret: string }): void;
    on(event: 'connect', handler: (err: Error | null, hostport: string) => void): void;
    on(event: 'error', handler: (err: Error) => void): void;
    invite(handler: (req: any, res: any) => void | Promise<void>): void;
    bye(handler: (req: any, res: any) => void | Promise<void>): void;
    cancel(handler: (req: any, res: any) => void | Promise<void>): void;
  }
}
