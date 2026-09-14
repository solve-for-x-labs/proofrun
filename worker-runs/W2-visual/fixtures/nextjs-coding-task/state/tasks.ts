// State enum for task lifecycle.
export enum TaskStatus {
  Idle = "idle",
  Loading = "loading",
  Ready = "ready",
  Error = "error",
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskState {
  status: TaskStatus;
  tasks: Task[];
}

export type TaskAction =
  | { type: "SET_STATUS"; status: TaskStatus }
  | { type: "ADD_TASK"; task: Task };

// Pure reducer over the TaskStatus enum.
export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "ADD_TASK":
      return { ...state, tasks: [...state.tasks, action.task] };
    default:
      return state;
  }
}
