"use client";

import { useState } from "react";
import Link from "next/link";
import { createProject, deleteProject, updateProject } from "@/app/actions";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { documents: number };
}

export function ProjectList({ projects }: { projects: Project[] }) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  async function handleCreate(formData: FormData) {
    setLoading(true);
    await createProject(formData);
    setLoading(false);
    setShowModal(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}" and all its documents?`)) return;
    await deleteProject(id);
  }

  function openEdit(project: Project) {
    setEditProject(project);
    setEditName(project.name);
    setEditDescription(project.description);
  }

  async function handleEdit() {
    if (!editProject || !editName.trim()) return;
    setEditLoading(true);
    await updateProject(editProject.id, editName, editDescription);
    setEditLoading(false);
    setEditProject(null);
  }

  return (
    <>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <button
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          id="create-project-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <div className="empty-state-title">No projects yet</div>
            <p className="empty-state-description">
              Create your first project to get started with requirements management.
            </p>
          </div>
        </div>
      ) : (
        <div className="card-grid stagger-in">
          {projects.map((project) => (
            <div key={project.id} className="card card-interactive" style={{ position: "relative" }}>
              <Link
                href={`/dashboard/projects/${project.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="card-title">{project.name}</div>
                <div className="card-description">
                  {project.description || "No description"}
                </div>
                <div className="card-meta">
                  <span>
                    {project._count.documents} document{project._count.documents !== 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
              <div
                style={{
                  position: "absolute",
                  top: "var(--space-3)",
                  right: "var(--space-3)",
                  display: "flex",
                  gap: "var(--space-1)",
                }}
              >
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ opacity: 0.5 }}
                  onClick={(e) => {
                    e.preventDefault();
                    openEdit(project);
                  }}
                  title="Edit project"
                  id={`edit-project-${project.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ opacity: 0.5 }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(project.id, project.name);
                  }}
                  title="Delete project"
                  id={`delete-project-${project.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Project</h2>
              <p className="modal-description">
                Set up a new project to organize your requirement documents.
              </p>
            </div>
            <form action={handleCreate}>
              <div className="modal-body">
                <div className="input-group">
                  <label className="input-label" htmlFor="project-name">
                    Project Name *
                  </label>
                  <input
                    className="input"
                    id="project-name"
                    name="name"
                    type="text"
                    placeholder="e.g. Flight Control System"
                    required
                    autoFocus
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="project-description">
                    Description
                  </label>
                  <textarea
                    className="textarea"
                    id="project-description"
                    name="description"
                    placeholder="Brief description of the project..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  id="submit-create-project"
                >
                  {loading ? (
                    <>
                      <span className="spinner" /> Creating...
                    </>
                  ) : (
                    "Create Project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editProject && (
        <div className="modal-overlay" onClick={() => setEditProject(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Project</h2>
              <p className="modal-description">
                Update the project name and description.
              </p>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label" htmlFor="edit-project-name">
                  Project Name *
                </label>
                <input
                  className="input"
                  id="edit-project-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Flight Control System"
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="edit-project-description">
                  Description
                </label>
                <textarea
                  className="textarea"
                  id="edit-project-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Brief description of the project..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditProject(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEdit}
                disabled={editLoading || !editName.trim()}
                id="submit-edit-project"
              >
                {editLoading ? (
                  <>
                    <span className="spinner" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
