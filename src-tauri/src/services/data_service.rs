use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::models::agent_rule::AgentRule;
use crate::models::chat::{ChatMessage, ChatThread};
use crate::models::project::Project;
use crate::models::task::{Task, TaskStatus, TaskStep, TaskStepType};

const PROJECT_DATABASE_FILE_NAME: &str = "projects.db.sqlite";

pub struct DataService {
    db_path: PathBuf,
}

impl DataService {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, rusqlite::Error> {
        let db_path = app_data_dir.join(PROJECT_DATABASE_FILE_NAME);
        let service = Self { db_path };
        service.initialize_schema()?;
        Ok(service)
    }

    pub fn load_projects(&self) -> Result<Vec<Project>, rusqlite::Error> {
        let connection = self.open_connection()?;
        let mut statement =
            connection.prepare("SELECT id FROM projects ORDER BY updated_at DESC")?;
        let project_ids = statement
            .query_map([], |row| row.get::<usize, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut projects = Vec::with_capacity(project_ids.len());
        for project_id in project_ids {
            if let Some(project) = self.load_project_with_connection(&connection, &project_id)? {
                projects.push(project);
            }
        }

        Ok(projects)
    }

    pub fn get_recent_projects(&self, count: usize) -> Result<Vec<Project>, rusqlite::Error> {
        if count == 0 {
            return Ok(Vec::new());
        }

        log::debug!("Loading recent projects, count: {count}");
        let connection = self.open_connection()?;
        let mut statement =
            connection.prepare("SELECT id FROM projects ORDER BY updated_at DESC LIMIT ?1")?;
        let project_ids = statement
            .query_map(params![count as i64], |row| row.get::<usize, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut projects = Vec::with_capacity(project_ids.len());
        for project_id in project_ids {
            if let Some(project) = self.load_project_with_connection(&connection, &project_id)? {
                projects.push(project);
            }
        }

        log::debug!("Loaded recent projects: {}", projects.len());

        Ok(projects)
    }

    pub fn load_project(&self, project_id: &str) -> Result<Option<Project>, rusqlite::Error> {
        let connection = self.open_connection()?;
        self.load_project_with_connection(&connection, project_id)
    }

    pub fn load_project_by_path(
        &self,
        project_path: &str,
    ) -> Result<Option<Project>, rusqlite::Error> {
        let connection = self.open_connection()?;
        let project_id: Option<String> = connection
            .query_row(
                "SELECT id FROM projects WHERE path = ?1 ORDER BY updated_at DESC LIMIT 1",
                params![project_path],
                |row| row.get(0),
            )
            .optional()?;

        let Some(project_id) = project_id else {
            return Ok(None);
        };

        self.load_project_with_connection(&connection, &project_id)
    }

    pub fn load_or_create_project_by_path(
        &self,
        project_path: &str,
    ) -> Result<Project, rusqlite::Error> {
        if let Some(existing_project) = self.load_project_by_path(project_path)? {
            return Ok(existing_project);
        }

        let now = Self::current_timestamp_millis();
        let project = Project {
            id: format!("project-{now}"),
            name: Self::project_name_from_path(project_path),
            path: project_path.to_string(),
            rules: Vec::new(),
            tasks: Vec::new(),
            created_at: now,
            updated_at: now,
        };

        self.upsert_project(&project)?;
        Ok(project)
    }

    pub fn upsert_project(&self, project: &Project) -> Result<(), rusqlite::Error> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;

        transaction.execute(
            "INSERT INTO projects (id, name, path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               path = excluded.path,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                project.id,
                project.name,
                project.path,
                project.created_at,
                project.updated_at
            ],
        )?;

        self.replace_project_rules(&transaction, project)?;
        self.replace_project_tasks(&transaction, project)?;

        transaction.commit()
    }

    pub fn delete_project(&self, project_id: &str) -> Result<(), rusqlite::Error> {
        let connection = self.open_connection()?;
        connection.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
        Ok(())
    }

    pub fn save_chat_thread(&self, thread: &ChatThread) -> Result<(), rusqlite::Error> {
        let connection = self.open_connection()?;
        connection.execute(
            "INSERT INTO chat_threads (id, project_id, title, agent_thread_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               project_id = excluded.project_id,
               title = excluded.title,
               agent_thread_id = excluded.agent_thread_id,
               updated_at = excluded.updated_at",
            params![
                thread.id,
                thread.project_id,
                thread.title,
                thread.agent_thread_id,
                thread.created_at,
                thread.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn save_chat_message(&self, message: &ChatMessage) -> Result<(), rusqlite::Error> {
        let connection = self.open_connection()?;
        connection.execute(
            "INSERT INTO chat_messages (id, thread_id, role, content, model, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               thread_id = excluded.thread_id,
               role = excluded.role,
               content = excluded.content,
               model = excluded.model,
               created_at = excluded.created_at",
            params![
                message.id,
                message.thread_id,
                message.role,
                message.content,
                message.model,
                message.created_at
            ],
        )?;

        connection.execute(
            "UPDATE chat_threads
             SET updated_at = CASE
               WHEN updated_at > ?2 THEN updated_at
               ELSE ?2
             END
             WHERE id = ?1",
            params![message.thread_id, message.created_at],
        )?;

        Ok(())
    }

    pub fn load_chat_threads_by_project(
        &self,
        project_id: &str,
        count: usize,
    ) -> Result<Vec<ChatThread>, rusqlite::Error> {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(
            "SELECT t.id, t.project_id, t.title, t.agent_thread_id, t.created_at, t.updated_at
             FROM chat_threads t
             WHERE t.project_id = ?1
               AND EXISTS (
                 SELECT 1
                 FROM chat_messages m
                 WHERE m.thread_id = t.id
               )
             ORDER BY t.updated_at DESC
             LIMIT ?2",
        )?;

        log::info!("Loading  threads: {}, count: {}", project_id, count);

        let threads = statement
            .query_map(params![project_id, count as i64], |row| {
                Ok(ChatThread {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    agent_thread_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(threads)
    }

    pub fn load_chat_messages_by_thread(
        &self,
        thread_id: &str,
    ) -> Result<Vec<ChatMessage>, rusqlite::Error> {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(
            "SELECT id, thread_id, role, content, model, created_at
             FROM chat_messages
             WHERE thread_id = ?1
             ORDER BY created_at ASC",
        )?;

        let messages = statement
            .query_map(params![thread_id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    thread_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    model: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(messages)
    }

    pub fn db_path(&self) -> &PathBuf {
        &self.db_path
    }

    fn open_connection(&self) -> Result<Connection, rusqlite::Error> {
        let connection = Connection::open(&self.db_path)?;
        connection.execute("PRAGMA foreign_keys = ON", [])?;
        Ok(connection)
    }

    fn initialize_schema(&self) -> Result<(), rusqlite::Error> {
        let connection = self.open_connection()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_rules (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS task_steps (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                type TEXT NOT NULL,
                step_kind TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_threads (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                agent_thread_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agent_rules_project_id ON agent_rules(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
            CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
            CREATE INDEX IF NOT EXISTS idx_chat_threads_project_id ON chat_threads(project_id);
            CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at ON chat_threads(updated_at);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
            ",
        )?;

        self.ensure_chat_thread_columns(&connection)?;

        Ok(())
    }

    fn ensure_chat_thread_columns(&self, connection: &Connection) -> Result<(), rusqlite::Error> {
        let mut statement = connection.prepare("PRAGMA table_info(chat_threads)")?;
        let columns = statement
            .query_map([], |row| row.get::<usize, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;

        if !columns.iter().any(|c| c == "created_at") {
            connection.execute(
                "ALTER TABLE chat_threads ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }

        if !columns.iter().any(|c| c == "updated_at") {
            connection.execute(
                "ALTER TABLE chat_threads ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }

        if !columns.iter().any(|c| c == "agent_thread_id") {
            connection.execute("ALTER TABLE chat_threads ADD COLUMN agent_thread_id TEXT", [])?;
        }

        connection.execute(
            "UPDATE chat_threads
             SET created_at = (CAST(strftime('%s','now') AS INTEGER) * 1000)
             WHERE created_at = 0",
            [],
        )?;

        connection.execute(
            "UPDATE chat_threads
             SET updated_at = created_at
             WHERE updated_at = 0",
            [],
        )?;

        Ok(())
    }

    fn load_project_with_connection(
        &self,
        connection: &Connection,
        project_id: &str,
    ) -> Result<Option<Project>, rusqlite::Error> {
        let project_row: Option<(String, String, String, i64, i64)> = connection
            .query_row(
                "SELECT id, name, path, created_at, updated_at FROM projects WHERE id = ?1",
                params![project_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()?;

        let Some((id, name, path, created_at, updated_at)) = project_row else {
            return Ok(None);
        };

        let rules = self.load_rules(connection, &id)?;
        let tasks = self.load_tasks(connection, &id)?;

        Ok(Some(Project {
            id,
            name,
            path,
            rules,
            tasks,
            created_at,
            updated_at,
        }))
    }

    fn load_rules(
        &self,
        connection: &Connection,
        project_id: &str,
    ) -> Result<Vec<AgentRule>, rusqlite::Error> {
        let mut statement = connection.prepare(
            "SELECT id, name, description, created_at, updated_at
             FROM agent_rules
             WHERE project_id = ?1
             ORDER BY updated_at DESC",
        )?;

        let rules = statement
            .query_map(params![project_id], |row| {
                Ok(AgentRule {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rules)
    }

    fn load_tasks(
        &self,
        connection: &Connection,
        project_id: &str,
    ) -> Result<Vec<Task>, rusqlite::Error> {
        let mut statement = connection.prepare(
            "SELECT id, title, description, status, created_at, updated_at
             FROM tasks
             WHERE project_id = ?1
             ORDER BY updated_at DESC",
        )?;

        let task_rows = statement
            .query_map(params![project_id], |row| {
                Ok((
                    row.get::<usize, String>(0)?,
                    row.get::<usize, String>(1)?,
                    row.get::<usize, String>(2)?,
                    row.get::<usize, String>(3)?,
                    row.get::<usize, i64>(4)?,
                    row.get::<usize, i64>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut tasks = Vec::with_capacity(task_rows.len());
        for (id, title, description, status, created_at, updated_at) in task_rows {
            let (presteps, steps, poststeps) = self.load_task_steps(connection, &id)?;
            tasks.push(Task {
                id,
                project_id: project_id.to_string(),
                title,
                description,
                presteps,
                steps,
                poststeps,
                status: Self::parse_task_status(&status),
                created_at,
                updated_at,
            });
        }

        Ok(tasks)
    }

    fn load_task_steps(
        &self,
        connection: &Connection,
        task_id: &str,
    ) -> Result<(Vec<TaskStep>, Vec<TaskStep>, Vec<TaskStep>), rusqlite::Error> {
        let mut statement = connection.prepare(
            "SELECT id, title, content, status, created_at, updated_at, type, step_kind
             FROM task_steps
             WHERE task_id = ?1
             ORDER BY sort_order ASC, updated_at ASC",
        )?;

        let step_rows = statement
            .query_map(params![task_id], |row| {
                Ok((
                    row.get::<usize, String>(0)?,
                    row.get::<usize, String>(1)?,
                    row.get::<usize, String>(2)?,
                    row.get::<usize, String>(3)?,
                    row.get::<usize, i64>(4)?,
                    row.get::<usize, i64>(5)?,
                    row.get::<usize, String>(6)?,
                    row.get::<usize, String>(7)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut presteps = Vec::new();
        let mut steps = Vec::new();
        let mut poststeps = Vec::new();

        for (id, title, content, status, created_at, updated_at, step_type, step_kind) in step_rows
        {
            let mapped_step = TaskStep {
                id,
                title,
                content,
                status: Self::parse_task_status(&status),
                created_at,
                updated_at,
                r#type: Self::parse_task_step_type(&step_type),
            };

            match step_kind.as_str() {
                "pre" => presteps.push(mapped_step),
                "post" => poststeps.push(mapped_step),
                _ => steps.push(mapped_step),
            }
        }

        Ok((presteps, steps, poststeps))
    }

    fn replace_project_rules(
        &self,
        transaction: &Transaction<'_>,
        project: &Project,
    ) -> Result<(), rusqlite::Error> {
        transaction.execute(
            "DELETE FROM agent_rules WHERE project_id = ?1",
            params![project.id],
        )?;

        for rule in &project.rules {
            transaction.execute(
                "INSERT INTO agent_rules (id, project_id, name, description, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    rule.id,
                    project.id,
                    rule.name,
                    rule.description,
                    rule.created_at,
                    rule.updated_at
                ],
            )?;
        }

        Ok(())
    }

    fn replace_project_tasks(
        &self,
        transaction: &Transaction<'_>,
        project: &Project,
    ) -> Result<(), rusqlite::Error> {
        transaction.execute(
            "DELETE FROM tasks WHERE project_id = ?1",
            params![project.id],
        )?;

        for task in &project.tasks {
            transaction.execute(
                "INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    task.id,
                    project.id,
                    task.title,
                    task.description,
                    Self::task_status_as_str(&task.status),
                    task.created_at,
                    task.updated_at
                ],
            )?;

            self.insert_task_steps(transaction, &task.id, "pre", &task.presteps)?;
            self.insert_task_steps(transaction, &task.id, "main", &task.steps)?;
            self.insert_task_steps(transaction, &task.id, "post", &task.poststeps)?;
        }

        Ok(())
    }

    fn insert_task_steps(
        &self,
        transaction: &Transaction<'_>,
        task_id: &str,
        step_kind: &str,
        steps: &[TaskStep],
    ) -> Result<(), rusqlite::Error> {
        for (index, step) in steps.iter().enumerate() {
            transaction.execute(
                "INSERT INTO task_steps (id, task_id, title, content, status, created_at, updated_at, type, step_kind, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    step.id,
                    task_id,
                    step.title,
                    step.content,
                    Self::task_status_as_str(&step.status),
                    step.created_at,
                    step.updated_at,
                    Self::task_step_type_as_str(&step.r#type),
                    step_kind,
                    index as i64
                ],
            )?;
        }

        Ok(())
    }

    fn task_status_as_str(status: &TaskStatus) -> &'static str {
        match status {
            TaskStatus::Pending => "pending",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed => "failed",
        }
    }

    fn parse_task_status(value: &str) -> TaskStatus {
        match value {
            "in_progress" => TaskStatus::InProgress,
            "completed" => TaskStatus::Completed,
            "failed" => TaskStatus::Failed,
            _ => TaskStatus::Pending,
        }
    }

    fn task_step_type_as_str(step_type: &TaskStepType) -> &'static str {
        match step_type {
            TaskStepType::Normal => "normal",
            TaskStepType::Pre => "pre",
            TaskStepType::Post => "post",
        }
    }

    fn parse_task_step_type(value: &str) -> TaskStepType {
        match value {
            "pre" => TaskStepType::Pre,
            "post" => TaskStepType::Post,
            _ => TaskStepType::Normal,
        }
    }

    fn current_timestamp_millis() -> i64 {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(duration) => duration.as_millis() as i64,
            Err(_) => 0,
        }
    }

    fn project_name_from_path(path: &str) -> String {
        let normalized_path = path.replace('\\', "/");
        let segments = normalized_path
            .split('/')
            .filter(|segment| !segment.is_empty());
        let last_segment = segments.last().unwrap_or(path);

        if last_segment.is_empty() {
            "Project".to_string()
        } else {
            last_segment.to_string()
        }
    }
}
