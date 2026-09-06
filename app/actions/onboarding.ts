"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { onboardingTaskDefinitions, isOnboardingTaskKey, type OnboardingTaskKey } from "@/lib/onboarding-tasks";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { evaluateReferralQualification } from "@/lib/referrals";

export async function completeOnboardingTaskAction(taskKey: OnboardingTaskKey) {
  const viewer = await requireViewer("/account/getting-started");
  if (!isOnboardingTaskKey(taskKey)) throw new Error("Invalid onboarding task");
  const definition = onboardingTaskDefinitions.find((task) => task.key === taskKey);
  if (!definition) throw new Error("Task not found");
  await prisma.userOnboardingTask.upsert({
    where: { userId_taskKey: { userId: viewer.id, taskKey } },
    update: { completedAt: new Date(), metadata: { destination: definition.href } as Prisma.InputJsonValue },
    create: { userId: viewer.id, taskKey, metadata: { destination: definition.href } as Prisma.InputJsonValue }
  });
  await evaluateReferralQualification(viewer.id);
  redirect(definition.href);
}
