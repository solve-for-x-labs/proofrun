import { test } from "node:test";
import assert from "node:assert/strict";
import { taskReducer, TaskStatus, type TaskState } from "../state/tasks.js";

// Test node: exercises the reducer over the TaskStatus enum.
test("taskReducer ADD_TASK appends and keeps status", () => {
  const start: TaskState = { status: TaskStatus.Idle, tasks: [] };
  const next = taskReducer(start, {
    type: "ADD_TASK",
    task: { id: "t1", title: "First", status: TaskStatus.Ready },
  });
  assert.equal(next.tasks.length, 1);
  assert.equal(next.status, TaskStatus.Idle);
});

test("taskReducer SET_STATUS changes status only", () => {
  const start: TaskState = { status: TaskStatus.Idle, tasks: [] };
  const next = taskReducer(start, { type: "SET_STATUS", status: TaskStatus.Loading });
  assert.equal(next.status, TaskStatus.Loading);
  assert.equal(next.tasks.length, 0);
});
