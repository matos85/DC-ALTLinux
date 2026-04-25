"use client";

import { apiRequest } from "@/lib/client-api";
import { sleep } from "@/lib/panel-utils";

type JobResponse = {
  id: number;
  status: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
};

export async function waitForJob(jobId: number, attempts = 15, delayMs = 1500) {
  for (let index = 0; index < attempts; index += 1) {
    const job = await apiRequest<JobResponse>(`/jobs/${jobId}/`);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await sleep(delayMs);
  }
  return apiRequest<JobResponse>(`/jobs/${jobId}/`);
}
