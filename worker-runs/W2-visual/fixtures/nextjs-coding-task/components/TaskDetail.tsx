// Detail panel for a single task.
export function TaskDetail({ taskId }: { taskId: string }) {
  return (
    <article className="task-detail">
      <h2>Task {taskId}</h2>
      <p>Details for task {taskId}</p>
    </article>
  );
}
