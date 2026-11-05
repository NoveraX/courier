import { BodyError } from "../body-error";

/** How much every upload of the process together may keep at once. */
export interface UploadCapacity {
  /** Bytes in memory: the shares of their files kept there, and their text fields */
  readonly memoryBytes: number;
  /** Bytes on disk */
  readonly diskBytes: number;
}

/**
 * The room every upload of the process shares unless the handler sets it,
 * and how long a client refused for want of it is told to wait. Apart from
 * `LIMITS`, which a page's bundle holds: only a server keeps an upload.
 */
export const UPLOAD_ROOM = {
  /** Bytes every upload together keeps in memory at once, files and text fields (64 MB) */
  MEMORY_BYTES: 67_108_864,
  /** Bytes every upload together keeps on disk at once (1 GB) */
  DISK_BYTES: 1_073_741_824,
  /** Seconds a client refused for want of room is told to wait before trying again */
  RETRY_AFTER_S: 5,
} as const;

/* What every upload of this process keeps right now. */
const kept = { memory: 0, disk: 0 };

/**
 * One upload's part of what all the process's uploads keep at once: each
 * piece it keeps is taken from the process's room for every upload, in
 * memory or on disk, and the whole of it given back as the upload is let go.
 * An upload is held to its own limits besides; this holds a crowd of them —
 * many clients uploading slowly at once — to what the process can spare.
 */
export class UploadHold {
  readonly #capacity: UploadCapacity;
  #memory = 0;
  #disk = 0;

  /** @param capacity - How much every upload together may keep */
  constructor(capacity: UploadCapacity) {
    this.#capacity = capacity;
  }

  /**
   * Keep `bytes` more in memory, where every upload together stays within
   * its room there.
   *
   * @param bytes - How many
   * @returns Whether they were taken; a file that was not goes to disk
   */
  tryMemory(bytes: number): boolean {
    if (kept.memory + bytes > this.#capacity.memoryBytes) return false;
    kept.memory += bytes;
    this.#memory += bytes;
    return true;
  }

  /**
   * Keep `bytes` more in memory, or refuse the upload: what cannot go to
   * disk — a text field, a file where there is no disk — has nowhere else.
   *
   * @param bytes - How many
   * @throws BodyError `UPLOAD_CAPACITY_REACHED` when there is no room left
   */
  memory(bytes: number): void {
    if (!this.tryMemory(bytes)) throw capacityReached();
  }

  /**
   * Keep `bytes` more on disk, or refuse the upload.
   *
   * @param bytes - How many
   * @throws BodyError `UPLOAD_CAPACITY_REACHED` when there is no room left
   */
  disk(bytes: number): void {
    if (kept.disk + bytes > this.#capacity.diskBytes) throw capacityReached();
    kept.disk += bytes;
    this.#disk += bytes;
  }

  /**
   * Give back `bytes` kept in memory, as a file written to disk does.
   *
   * @param bytes - How many
   */
  freeMemory(bytes: number): void {
    kept.memory -= bytes;
    this.#memory -= bytes;
  }

  /** Give back everything the upload keeps, as it is let go. */
  release(): void {
    kept.memory -= this.#memory;
    kept.disk -= this.#disk;
    this.#memory = 0;
    this.#disk = 0;
  }
}

function capacityReached(): BodyError {
  return new BodyError(
    "UPLOAD_CAPACITY_REACHED",
    "The server keeps as many uploads as it can at once: try again shortly",
  );
}
