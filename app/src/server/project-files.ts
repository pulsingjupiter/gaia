/**
 * File mirror layer for collaborative projects.
 *
 * Owns the .gaia/ folder layout and provides export/import helpers.
 * - project.json: description, brief_markdown
 * - milestones.json: array of milestones
 * - tasks/<id>.json: one file per task
 *
 * All functions are pure and operate on the file system via `project.path`.
 * They do not know about HTTP requests or API responses.
 */
import path from "node:path";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import {
  getProject,
  getTask,
  listAllTasks,
  listMilestones,
  insertMilestone,
  insertTask,
  updateMilestone,
  updateTask,
  updateProject,
  deleteTask as deleteTaskFromDb,
  getDb,
} from "./db.ts";

// ---------------------------------------------------------------------------
// File Shapes
// ---------------------------------------------------------------------------

export interface GaiaProjectFile {
  description: string | null;
  brief_markdown: string | null;
}

// Sticking to db.ts types, user instructions had some field name differences.
// name -> title, due_date -> due_at, sort_order -> position
export interface GaiaMilestoneFile {
  id: string;
  name: string;
  description: string | null;
  due_date: number | null;
  status: "active" | "complete" | "archived";
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface GaiaTaskFile {
  id: string;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "done" | "archived";
  priority: "high" | "medium" | "low";
  due_date: number | null;
  milestone_id: string | null;
  description: string | null;
  recurrence: "daily" | "weekdays" | "weekly" | "monthly" | null;
  // Non-core fields, but useful for full fidelity
  employee_id: string | null;
  skill: string | null;
  playbook: string | null;
  created_at: number | null;
  recurrence_anchor: number | null;
  parent_task_id: string | null;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

export function gaiaDir(projectPath: string): string {
  return path.join(projectPath, ".gaia");
}

/**
 * True when `.gaia/` exists on disk under the project's path.
 * Returns false (not throws) on any access error — non-existent path,
 * missing project, permission denied — treat as "not collaborative-ready".
 */
export async function projectHasGaiaDir(projectId: string): Promise<boolean> {
  const project = getProject(projectId);
  if (!project || !project.path) return false;
  try {
    await access(gaiaDir(project.path));
    return true;
  } catch {
    return false;
  }
}

function tasksDir(projectPath: string): string {
  return path.join(gaiaDir(projectPath), "tasks");
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const content = JSON.stringify(data, null, 2) + "\n";
  await writeFile(filePath, content, "utf8");
}

export async function readProjectFile(projectPath: string): Promise<GaiaProjectFile | null> {
  return readJson<GaiaProjectFile>(path.join(gaiaDir(projectPath), "project.json"));
}

export async function writeProjectFile(projectPath: string, value: GaiaProjectFile): Promise<void> {
  await writeJson(path.join(gaiaDir(projectPath), "project.json"), value);
}

export async function readMilestonesFile(projectPath: string): Promise<GaiaMilestoneFile[]> {
  return (await readJson<GaiaMilestoneFile[]>(path.join(gaiaDir(projectPath), "milestones.json"))) ?? [];
}

export async function writeMilestonesFile(projectPath: string, values: GaiaMilestoneFile[]): Promise<void> {
  await writeJson(path.join(gaiaDir(projectPath), "milestones.json"), values);
}

export async function readTaskFile(projectPath: string, taskId: string): Promise<GaiaTaskFile | null> {
  return readJson<GaiaTaskFile>(path.join(tasksDir(projectPath), `${taskId}.json`));
}

export async function writeTaskFile(projectPath: string, value: GaiaTaskFile): Promise<void> {
  await writeJson(path.join(tasksDir(projectPath), `${value.id}.json`), value);
}

export async function deleteTaskFile(projectPath: string, taskId: string): Promise<void> {
  try {
    await rm(path.join(tasksDir(projectPath), `${taskId}.json`));
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return; // Already deleted
    }
    throw err;
  }
}

export async function listTaskFiles(projectPath: string): Promise<GaiaTaskFile[]> {
  const dir = tasksDir(projectPath);
  try {
    const files = await readdir(dir);
    const tasks: GaiaTaskFile[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const task = await readJson<GaiaTaskFile>(path.join(dir, file));
        if (task) tasks.push(task);
      }
    }
    return tasks;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return [];
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Export / Import Orchestrators
// ---------------------------------------------------------------------------

export async function exportProjectToFiles(projectId: string): Promise<void> {
  const project = getProject(projectId);
  if (!project || !project.path) return;

  // Export project description and brief
  await writeProjectFile(project.path, {
    description: project.description,
    brief_markdown: project.brief_markdown,
  });

  // Export milestones
  const milestones = listMilestones({ project_id: projectId });
  const gaiaMilestones: GaiaMilestoneFile[] = milestones.map(m => {
    const { project_id, ...rest } = m;
    return { ...rest, name: m.name }; // match GaiaMilestoneFile
  });
  await writeMilestonesFile(project.path, gaiaMilestones);

  // Export tasks
  const tasks = listAllTasks({ project_id: projectId });
  const taskIdsInDb = new Set(tasks.map(t => t.id));

  for (const task of tasks) {
    const gaiaTask: GaiaTaskFile = {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      milestone_id: task.milestone_id,
      description: task.description,
      recurrence: task.recurrence,
      employee_id: task.employee_id,
      skill: task.skill,
      playbook: task.playbook,
      created_at: task.created_at,
      recurrence_anchor: task.recurrence_anchor,
      parent_task_id: task.parent_task_id,
    };
    await writeTaskFile(project.path, gaiaTask);
  }

  // Prune task files that are no longer in the DB
  const taskFiles = await listTaskFiles(project.path);
  for (const taskFile of taskFiles) {
    if (!taskIdsInDb.has(taskFile.id)) {
      await deleteTaskFile(project.path, taskFile.id);
    }
  }
}

export async function importProjectFromFiles(projectId: string): Promise<void> {
    const project = getProject(projectId);
    if (!project || !project.path) return;
  
    const db = getDb();

    // Read all files first
    const gaiaProject = await readProjectFile(project.path);
    const gaiaMilestones = await readMilestonesFile(project.path);
    const gaiaTasks = await listTaskFiles(project.path);
  
    const tx = db.transaction(() => {
      // Import project file
      if (gaiaProject) {
        updateProject(projectId, {
          description: gaiaProject.description,
          brief_markdown: gaiaProject.brief_markdown,
        });
      }
  
      // Import milestones
      const dbMilestones = listMilestones({ project_id: projectId });
      const dbMilestoneIds = new Set(dbMilestones.map(m => m.id));
      for (const gaiaMilestone of gaiaMilestones) {
        if (dbMilestoneIds.has(gaiaMilestone.id)) {
          updateMilestone(gaiaMilestone.id, { ...gaiaMilestone });
        } else {
          insertMilestone({ ...gaiaMilestone, project_id: projectId });
        }
      }
  
      // Import tasks
      const gaiaTaskIds = new Set(gaiaTasks.map(t => t.id));
  
      for (const gaiaTask of gaiaTasks) {
        const existing = getTask(gaiaTask.id);
        if (existing) {
          updateTask(gaiaTask.id, { ...gaiaTask });
        } else {
          insertTask({
            ...gaiaTask,
            project_id: projectId,
            created_at: gaiaTask.created_at ?? undefined,
          });
        }
      }
  
      // Delete tasks from DB that are not in files
      const dbTasks = listAllTasks({ project_id: projectId });
      for (const dbTask of dbTasks) {
        if (!gaiaTaskIds.has(dbTask.id)) {
          deleteTaskFromDb(dbTask.id);
        }
      }
    });

    tx();
}
