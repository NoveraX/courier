import { type Method, RequestGroup } from "@noverax/nexus/RequestClass";

type UploadResponse = {
  success: boolean;
  file: {
    originalName: string;
    mimeType: string;
    size: number;
  };
  fields: Record<string, string>;
};

export class Files extends RequestGroup {
  constructor() {
    super({ prefix: "upload" });
  }

  upload: Method<UploadResponse, FormData> = ({ post }) => post();
}

export type { UploadResponse };
