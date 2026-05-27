import { credentials, type ChannelCredentials } from '@grpc/grpc-js';
import { ClassifierServiceClient } from './grpc/gen/folio/ai/v1/classifier';

let client: ClassifierServiceClient | null = null;
let clientTarget: string | null = null;

export function getClassifierGrpcClient(
  host: string,
  port: number,
): ClassifierServiceClient {
  const target = `${host}:${port}`;
  if (client && clientTarget === target) {
    return client;
  }
  if (client) {
    client.close();
    client = null;
  }
  clientTarget = target;
  client = new ClassifierServiceClient(
    target,
    credentials.createInsecure() as ChannelCredentials,
  );
  return client;
}

export function closeClassifierGrpcClient(): void {
  if (client) {
    client.close();
    client = null;
    clientTarget = null;
  }
}
