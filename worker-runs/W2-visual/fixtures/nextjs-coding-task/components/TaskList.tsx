import { useReducer } from "react";
import { taskReducer, type TaskState } from "../state/tasks";
import { TaskDetail } from "./TaskDetail";

const initialState: TaskState = {
  status: "idle",
  tasks: [],
};

// TaskList drives the reducer and renders the board.
export function TaskList() {
  const [state, dispatch] = useReducer(taskReducer, initialState);

  return (
    <ul className="task-list">
      {state.tasks.map((task) => (
        <li key={task.id}>
          <TaskDetail taskId={task.id} />
          <button onClick={() => dispatch({ type: "ADD_TASK", task })}>
            {state.status}
          </button>
        </li>
      ))}
    </ul>
  );
}
