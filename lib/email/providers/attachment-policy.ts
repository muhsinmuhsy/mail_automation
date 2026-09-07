/** Public, transport-independent contract. Add a policy alongside each new provider. */
export interface AttachmentPolicy {
  provider: string;
  name: string;
  maxCount: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}
