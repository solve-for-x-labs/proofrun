import { TaskDetail } from "../../../components/TaskDetail";

// Dynamic route: /tasks/[id]
export default function TaskPage({ params }: { params: { id: string } }) {
  return <TaskDetail taskId={params.id} />;
}
