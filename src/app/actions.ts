"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

// ─── Project Actions ─────────────────────────────────────

export async function createProject(formData: FormData) {
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || "";

  if (!name || name.trim().length === 0) {
    return { error: "Project name is required" };
  }

  // TODO: get actual user ID from session
  const user = await prisma.user.findFirst();
  if (!user) {
    // Create a default user for development
    const defaultUser = await prisma.user.create({
      data: {
        email: "admin@documan.local",
        name: "Admin",
        passwordHash: "dev-mode",
      },
    });
    const project = await prisma.project.create({
      data: { name: name.trim(), description: description.trim(), ownerId: defaultUser.id },
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    return { project };
  }

  const project = await prisma.project.create({
    data: { name: name.trim(), description: description.trim(), ownerId: user.id },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  return { project };
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  return { success: true };
}

export async function updateProject(projectId: string, name: string, description: string, aiContext?: string) {
  if (!name || name.trim().length === 0) {
    return { error: "Project name is required" };
  }

  const updateData: Record<string, unknown> = {
    name: name.trim(),
    description: description.trim(),
  };
  if (aiContext !== undefined) {
    updateData.aiContext = aiContext.trim();
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { project };
}

// ─── Document Actions ────────────────────────────────────

export async function deleteDocument(documentId: string, projectId: string) {
  await prisma.document.delete({ where: { id: documentId } });
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true };
}

export async function updateDocument(
  documentId: string,
  projectId: string,
  data: { title?: string; docCategory?: string }
) {
  if (data.title !== undefined && data.title.trim().length === 0) {
    return { error: "Document title is required" };
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.docCategory !== undefined) updateData.docCategory = data.docCategory;

  await prisma.document.update({
    where: { id: documentId },
    data: updateData,
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/documents/${documentId}`);
  return { success: true };
}

export async function updateDocumentStatus(
  documentId: string,
  newStatus: string,
  projectId: string
) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return { error: "Document not found" };

  const validTransitions: Record<string, string[]> = {
    DRAFT: ["REVIEW"],
    REVIEW: ["DRAFT", "PUBLISHED"],
    PUBLISHED: [], // Cannot change published status
  };

  if (!validTransitions[doc.status]?.includes(newStatus)) {
    return { error: `Cannot transition from ${doc.status} to ${newStatus}` };
  }

  const updateData: Record<string, unknown> = { status: newStatus };

  // If publishing, increment major version and freeze
  if (newStatus === "PUBLISHED") {
    updateData.majorVersion = doc.majorVersion + 1;
    updateData.minorVersion = 0;

    // Create a document version snapshot
    const user = await prisma.user.findFirst();
    if (user) {
      await prisma.documentVersion.create({
        data: {
          documentId,
          majorVersion: doc.majorVersion + 1,
          minorVersion: 0,
          status: "PUBLISHED",
          changeDescription: `Published as v${doc.majorVersion + 1}.0`,
          createdById: user.id,
        },
      });
    }
  }

  await prisma.document.update({
    where: { id: documentId },
    data: updateData,
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/documents/${documentId}`);
  return { success: true };
}

// ─── Requirement Actions ─────────────────────────────────

export async function updateRequirement(
  requirementId: string,
  content: string,
  title: string,
  projectId: string,
  documentId: string
) {
  const req = await prisma.requirement.findUnique({ where: { id: requirementId } });
  if (!req) return { error: "Requirement not found" };

  // Create a version record before updating
  const user = await prisma.user.findFirst();
  if (user) {
    const versionCount = await prisma.requirementVersion.count({
      where: { requirementId },
    });

    await prisma.requirementVersion.updateMany({
      where: { requirementId, isCurrent: true },
      data: { isCurrent: false },
    });

    await prisma.requirementVersion.create({
      data: {
        requirementId,
        version: versionCount + 1,
        content,
        title,
        editedById: user.id,
        isCurrent: true,
      },
    });
  }

  // Update the requirement
  await prisma.requirement.update({
    where: { id: requirementId },
    data: { content, title, updatedAt: new Date() },
  });

  // Mark linked requirements as suspect
  await prisma.traceabilityLink.updateMany({
    where: {
      OR: [
        { sourceRequirementId: requirementId },
        { targetRequirementId: requirementId },
      ],
    },
    data: { isSuspect: true },
  });

  // Increment document minor version
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (doc && doc.status !== "PUBLISHED") {
    await prisma.document.update({
      where: { id: documentId },
      data: { minorVersion: doc.minorVersion + 1 },
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}/documents/${documentId}`);
  return { success: true };
}

export async function addRequirement(
  documentId: string,
  data: {
    itemNumber: string;
    uniqueId: string;
    category: string;
    title: string;
    content: string;
    sortOrder: number;
    indentLevel: number;
    parentRequirementId?: string;
  },
  projectId: string
) {
  const req = await prisma.requirement.create({
    data: {
      documentId,
      ...data,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}/documents/${documentId}`);
  return { requirement: req };
}

export async function deleteRequirement(
  requirementId: string,
  projectId: string,
  documentId: string
) {
  await prisma.requirement.delete({ where: { id: requirementId } });
  revalidatePath(`/dashboard/projects/${projectId}/documents/${documentId}`);
  return { success: true };
}

// ─── Glossary Actions ────────────────────────────────────

export async function addGlossaryTerm(
  projectId: string,
  term: string,
  definition: string,
  aliases: string
) {
  const glossaryTerm = await prisma.glossaryTerm.create({
    data: {
      projectId,
      term: term.trim(),
      definition: definition.trim(),
      aliases: aliases.trim(),
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { glossaryTerm };
}

export async function updateGlossaryTerm(
  id: string,
  data: { term?: string; definition?: string; aliases?: string }
) {
  const updateData: Record<string, unknown> = {};
  if (data.term !== undefined) updateData.term = data.term.trim();
  if (data.definition !== undefined) updateData.definition = data.definition.trim();
  if (data.aliases !== undefined) updateData.aliases = data.aliases.trim();

  const glossaryTerm = await prisma.glossaryTerm.update({
    where: { id },
    data: updateData,
  });

  revalidatePath(`/dashboard/projects/${glossaryTerm.projectId}`);
  return { glossaryTerm };
}

export async function deleteGlossaryTerm(id: string) {
  const glossaryTerm = await prisma.glossaryTerm.delete({ where: { id } });
  revalidatePath(`/dashboard/projects/${glossaryTerm.projectId}`);
  return { success: true };
}

// ─── Review Flag Actions ─────────────────────────────────

export async function dismissReviewFlag(requirementId: string) {
  const req = await prisma.requirement.update({
    where: { id: requirementId },
    data: { requiresReview: false, reviewReason: "" },
    select: { document: { select: { id: true, projectId: true } } },
  });

  revalidatePath(`/dashboard/projects/${req.document.projectId}/documents/${req.document.id}`);
  return { success: true };
}
