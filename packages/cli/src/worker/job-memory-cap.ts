/**
 * How Courier tells a job's process the most memory it may take, and how the
 * process says it took more: the environment variable its memory watch
 * reads the cap from, in megabytes, and the words the line it writes to its
 * stderr opens with as it stops the process.
 */
export const JOB_MEMORY_CAP = {
  env: "COURIER_STUDIO_JOB_MEMORY_MB",
  passed: "A job process passed its memory cap",
} as const;
