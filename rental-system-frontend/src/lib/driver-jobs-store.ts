// "use client";

// import { useCallback, useEffect, useState } from "react";
// import { DriverJob, DriverJobStatus, mockDriverJobs } from "./mock/driver-jobs";

// const STORAGE_KEY = "driver-jobs-state-v1";

// export type PendingActionType = "job-status" | "stop-completed";

// export interface PendingAction {
//   id: string;
//   type: PendingActionType;
//   jobId: string;
//   stopId?: string;
//   newStatus?: DriverJobStatus;
//   createdAt: string;
// }

// interface DriverJobsState {
//   jobs: DriverJob[];
//   pendingActions: PendingAction[];
//   loaded: boolean;
//   markJobStatus: (jobId: string, status: DriverJobStatus) => void;
//   markStopCompleted: (jobId: string, stopId: string) => void;
//   clearPendingAction: (id: string) => void; // later when backend sync succeeds
// }

// function generateActionId() {
//   return `PA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
// }

// export function useDriverJobs(): DriverJobsState {
//   const [jobs, setJobs] = useState<DriverJob[]>([]);
//   const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
//   const [loaded, setLoaded] = useState(false);

//   // Load from localStorage once
//   useEffect(() => {
//     if (typeof window === "undefined") return;

//     try {
//       const raw = window.localStorage.getItem(STORAGE_KEY);
//       if (raw) {
//         const parsed = JSON.parse(raw);
//         setJobs(parsed.jobs || []);
//         setPendingActions(parsed.pendingActions || []);
//       } else {
//         // Seed with mock data on first run
//         setJobs(mockDriverJobs);
//         setPendingActions([]);
//       }
//     } catch (e) {
//       console.error("Failed to load driver jobs from localStorage", e);
//       setJobs(mockDriverJobs);
//       setPendingActions([]);
//     } finally {
//       setLoaded(true);
//     }
//   }, []);

//   // Persist whenever jobs or pendingActions change
//   useEffect(() => {
//     if (!loaded) return;
//     try {
//       const payload = JSON.stringify({ jobs, pendingActions });
//       window.localStorage.setItem(STORAGE_KEY, payload);
//     } catch (e) {
//       console.error("Failed to save driver jobs to localStorage", e);
//     }
//   }, [jobs, pendingActions, loaded]);

//   const markJobStatus = useCallback(
//     (jobId: string, status: DriverJobStatus) => {
//       setJobs((prev) =>
//         prev.map((job) =>
//           job.id === jobId ? { ...job, status } : job
//         )
//       );

//       const action: PendingAction = {
//         id: generateActionId(),
//         type: "job-status",
//         jobId,
//         newStatus: status,
//         createdAt: new Date().toISOString(),
//       };
//       setPendingActions((prev) => [...prev, action]);
//     },
//     []
//   );

//   const markStopCompleted = useCallback((jobId: string, stopId: string) => {
//     setJobs((prev) =>
//       prev.map((job) =>
//         job.id === jobId
//           ? {
//               ...job,
//               stops: job.stops.map((s) =>
//                 s.id === stopId ? { ...s, completed: true } : s
//               ),
//             }
//           : job
//       )
//     );

//     const action: PendingAction = {
//       id: generateActionId(),
//       type: "stop-completed",
//       jobId,
//       stopId,
//       createdAt: new Date().toISOString(),
//     };
//     setPendingActions((prev) => [...prev, action]);
//   }, []);

//   const clearPendingAction = useCallback((id: string) => {
//     setPendingActions((prev) => prev.filter((a) => a.id !== id));
//   }, []);

//   return {
//     jobs,
//     pendingActions,
//     loaded,
//     markJobStatus,
//     markStopCompleted,
//     clearPendingAction,
//   };
// }
