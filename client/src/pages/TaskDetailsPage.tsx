
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError, type Task } from "../api";

export default function TaskDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: task, isLoading, error } = useQuery<Task, ApiError>({ 
        queryKey: ["task", id], 
        queryFn: () => api.getTask(id!),
        enabled: Boolean(id),
        retry: false
    });

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    if (!task) return <div>Task not found</div>;

    return (
        <div>
            <h1>{task.title}</h1>
            <p>{task.description}</p>
            <p>Status: {task.status}</p>
            <p>Priority: {task.priority}</p>
            <p>Due Date: {task.dueDate ?? "N/A"}</p>
            <button onClick={() => navigate(`/tasks/${task.id}/edit`)}>Edit Task</button>
        </div>
    );
}