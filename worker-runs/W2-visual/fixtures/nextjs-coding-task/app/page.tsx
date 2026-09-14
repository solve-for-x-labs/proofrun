import { TaskList } from "../../components/TaskList";

// Landing page: app/page.tsx renders the task board.
export default function HomePage() {
  return (
    <section className="home">
      <h1>Coding Task Board</h1>
      <TaskList />
    </section>
  );
}
