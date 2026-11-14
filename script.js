/* ==========================================================================
   TASKFLOW — APPLICATION DASHBOARD CONTROLLER (script.js)
   Firebase Auth Route Protection, User Profile Sync, and Real-Time Tasks.
   ========================================================================== */

import { auth, db, isFirebaseConfigured } from "./firebase-config.js";
import { 
  protectRoute, 
  logoutUser, 
  getUserProfile, 
  getInitials, 
  checkFirebaseConfigNotice 
} from "./auth.js";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Active Authenticated User State
let currentUser = {
  uid: null,
  name: "Alex Morgan",
  email: "alex.morgan@taskflow.com",
  role: "Productivity Pro",
  avatar: "AM"
};

// Application State
let tasks = [];
let activeView = "overview";     // "overview" | "tasks" | "today" | "upcoming" | "completed"
let statusFilter = "all";        // "all" | "pending" | "completed"
let searchQuery = "";            // Live keyword search
let editingTaskId = null;        // ID of task currently undergoing inline edit
let userStorageKey = "taskflow_workspace_v1";

// DOM Element Selectors
const taskListEl = document.getElementById("task-list-element");
const emptyStateBox = document.getElementById("empty-state-box");
const emptyHeadline = document.getElementById("empty-state-headline");
const emptyDesc = document.getElementById("empty-state-description");

// Statistics Elements
const statTotalEl = document.getElementById("stat-total");
const statPendingEl = document.getElementById("stat-pending");
const statCompletedEl = document.getElementById("stat-completed");
const progressPercentageLabel = document.getElementById("progress-percentage-label");
const progressStatusCaption = document.getElementById("progress-status-caption");
const circleProgress = document.getElementById("circle-progress");

// Sidebar Progress Widget
const sidebarProgressLabel = document.getElementById("sidebar-progress-label");
const sidebarProgressBar = document.getElementById("sidebar-progress-bar");
const sidebarProgressCaption = document.getElementById("sidebar-progress-caption");

// View Title and Counters
const currentViewTitle = document.getElementById("current-view-title");
const currentViewCount = document.getElementById("current-view-count");

// Sidebar Navigation Badges
const navCountAll = document.getElementById("nav-count-all");
const navCountPending = document.getElementById("nav-count-pending");
const navCountToday = document.getElementById("nav-count-today");
const navCountUpcoming = document.getElementById("nav-count-upcoming");
const navCountCompleted = document.getElementById("nav-count-completed");

// Forms and Inputs
const createTaskForm = document.getElementById("create-task-form");
const taskTitleInput = document.getElementById("task-title-input");
const taskPriorityInput = document.getElementById("task-priority-input");
const taskDateInput = document.getElementById("task-date-input");
const creatorErrorMsg = document.getElementById("creator-error");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");

// Navigation & Filters
const navLinks = document.querySelectorAll(".nav-link");
const pillButtons = document.querySelectorAll(".pill-btn");
const clearTasksBtn = document.getElementById("clear-tasks-btn");

// Notification Elements
const notificationBtn = document.getElementById("notification-btn");
const notificationDropdown = document.getElementById("notification-dropdown");

// Mobile Drawer Elements
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

// Confirmation Modal Elements
const confirmModal = document.getElementById("confirm-modal");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");

// Hero & Date Elements
const welcomeGreeting = document.getElementById("welcome-greeting");
const welcomeDateFull = document.getElementById("welcome-date-full");
const currentDateText = document.getElementById("current-date-text");
const unverifiedBanner = document.getElementById("unverified-banner");

/* ==========================================================================
   1. Route Protection & User Authentication Handshake
   ========================================================================== */

protectRoute({
  requireAuth: true,
  redirectUrl: "login.html",
  onUserReady: async (user) => {
    if (!user) return;

    // Fetch user profile from Firestore or fallback to Auth profile
    const firestoreProfile = await getUserProfile(user.uid);
    const resolvedName = firestoreProfile?.displayName || user.displayName || user.email.split("@")[0].replace(".", " ");
    const resolvedRole = firestoreProfile?.role || "Productivity Pro";

    currentUser = {
      uid: user.uid,
      name: resolvedName,
      email: user.email,
      role: resolvedRole,
      avatar: getInitials(resolvedName)
    };

    userStorageKey = `taskflow_tasks_${user.uid}`;

    // Display / Hide Unverified Email Banner
    const isPasswordUser = user.providerData?.[0]?.providerId === "password";
    if (unverifiedBanner) {
      if (isPasswordUser && !user.emailVerified) {
        unverifiedBanner.classList.remove("hidden");
      } else {
        unverifiedBanner.classList.add("hidden");
      }
    }

    // Initialize Dashboard UI with User Details
    setupDateAndGreeting();
    setupUserProfile();
    await loadTasksForUser();
    renderApp();
  }
});

/* ==========================================================================
   2. Date, Greetings, and Notifications
   ========================================================================== */

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setupDateAndGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const firstName = (currentUser.name || "Alex").trim().split(" ")[0];

  let greeting = `Good evening, ${firstName}`;
  if (hour < 12) {
    greeting = `Good morning, ${firstName}`;
  } else if (hour < 18) {
    greeting = `Good afternoon, ${firstName}`;
  }

  welcomeGreeting.textContent = greeting;

  const optionsFull = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  welcomeDateFull.textContent = now.toLocaleDateString("en-US", optionsFull);

  const optionsBadge = { weekday: "short", month: "short", day: "numeric" };
  currentDateText.textContent = now.toLocaleDateString("en-US", optionsBadge);

  taskDateInput.value = getTodayDateString();
}

function setupUserProfile() {
  const profileNameEl = document.getElementById("profile-name");
  const profileInitialsEl = document.getElementById("profile-initials");
  const profileRoleEl = document.getElementById("profile-role");
  const logoutBtn = document.getElementById("logout-btn");

  if (profileNameEl) profileNameEl.textContent = currentUser.name || "Alex Morgan";
  if (profileInitialsEl) profileInitialsEl.textContent = currentUser.avatar || "AM";
  if (profileRoleEl) profileRoleEl.textContent = currentUser.role || "Productivity Pro";

  if (logoutBtn) {
    // Remove existing event listener clones to prevent double-firing
    logoutBtn.onclick = async () => {
      const isConfirmed = window.confirm("Are you sure you want to sign out of TaskFlow?");
      if (isConfirmed) {
        await logoutUser("login.html");
      }
    };
  }
}

function toggleNotifications(event) {
  event.stopPropagation();
  notificationDropdown.classList.toggle("hidden");
}

/* ==========================================================================
   3. Task Data Persistence (Firestore + Local Storage)
   ========================================================================== */

function getInitialSeedTasks() {
  const today = getTodayDateString();
  return [
    {
      id: "task_1",
      title: "Review quarterly product roadmap and user research",
      completed: true,
      priority: "high",
      dueDate: today,
      createdAt: new Date().toISOString()
    },
    {
      id: "task_2",
      title: "Design classic typography and visual layout system",
      completed: false,
      priority: "high",
      dueDate: today,
      createdAt: new Date().toISOString()
    },
    {
      id: "task_3",
      title: "Configure Firebase Authentication & Cloud Firestore rules",
      completed: true,
      priority: "medium",
      dueDate: "2026-11-20",
      createdAt: new Date().toISOString()
    }
  ];
}

/**
 * Loads tasks for the authenticated user from Local Storage and Firestore.
 */
async function loadTasksForUser() {
  // 1. Fast load from Local Storage
  try {
    const rawData = localStorage.getItem(userStorageKey);
    if (rawData) {
      tasks = JSON.parse(rawData);
    } else {
      tasks = getInitialSeedTasks();
      saveTasksToStorage();
    }
  } catch (error) {
    console.error("Local Storage load error:", error);
    tasks = [];
  }

  // 2. Cloud Firestore synchronization (if configured)
  if (isFirebaseConfigured() && currentUser.uid) {
    try {
      const tasksColRef = collection(db, "users", currentUser.uid, "tasks");
      const snapshot = await getDocs(tasksColRef);
      if (!snapshot.empty) {
        const cloudTasks = [];
        snapshot.forEach((docSnap) => {
          cloudTasks.push({ id: docSnap.id, ...docSnap.data() });
        });
        tasks = cloudTasks;
        saveTasksToStorage();
        renderApp();
      }
    } catch (fsErr) {
      console.warn("Firestore task sync skipped (local tasks active):", fsErr);
    }
  }
}

function saveTasksToStorage() {
  try {
    localStorage.setItem(userStorageKey, JSON.stringify(tasks));
  } catch (error) {
    console.error("TaskFlow: Error saving tasks to Local Storage", error);
  }
}

/**
 * Syncs a single task update or creation to Cloud Firestore.
 */
async function syncTaskToFirestore(task) {
  if (!isFirebaseConfigured() || !currentUser.uid) return;
  try {
    const taskDocRef = doc(db, "users", currentUser.uid, "tasks", task.id);
    await setDoc(taskDocRef, task, { merge: true });
  } catch (err) {
    console.warn("Firestore: Task sync failed:", err);
  }
}

async function removeTaskFromFirestore(taskId) {
  if (!isFirebaseConfigured() || !currentUser.uid) return;
  try {
    const taskDocRef = doc(db, "users", currentUser.uid, "tasks", taskId);
    await deleteDoc(taskDocRef);
  } catch (err) {
    console.warn("Firestore: Task deletion failed:", err);
  }
}

/* ==========================================================================
   4. Task CRUD Operations
   ========================================================================== */

function addTask(title, priority, dueDate) {
  const cleanTitle = title.trim();

  if (!cleanTitle) {
    showError("Please enter a task title before submitting.");
    return;
  }

  clearError();

  const newTask = {
    id: "task_" + Date.now().toString(),
    title: cleanTitle,
    completed: false,
    priority: priority || "medium",
    dueDate: dueDate || "",
    userId: currentUser.uid,
    createdAt: new Date().toISOString()
  };

  tasks.unshift(newTask);
  saveTasksToStorage();
  syncTaskToFirestore(newTask);
  renderApp();

  taskTitleInput.value = "";
  taskTitleInput.focus();
}

function toggleTaskStatus(id) {
  let updatedTask = null;

  tasks = tasks.map((task) => {
    if (task.id === id) {
      updatedTask = { ...task, completed: !task.completed };
      return updatedTask;
    }
    return task;
  });

  saveTasksToStorage();
  if (updatedTask) syncTaskToFirestore(updatedTask);
  renderApp();
}

function startEdit(id) {
  editingTaskId = id;
  renderTaskList();
}

function saveEdit(id, newTitle) {
  const cleanTitle = newTitle.trim();
  if (!cleanTitle) {
    cancelEdit();
    return;
  }

  let updatedTask = null;

  tasks = tasks.map((task) => {
    if (task.id === id) {
      updatedTask = { ...task, title: cleanTitle };
      return updatedTask;
    }
    return task;
  });

  editingTaskId = null;
  saveTasksToStorage();
  if (updatedTask) syncTaskToFirestore(updatedTask);
  renderApp();
}

function cancelEdit() {
  editingTaskId = null;
  renderTaskList();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  if (editingTaskId === id) {
    editingTaskId = null;
  }
  saveTasksToStorage();
  removeTaskFromFirestore(id);
  renderApp();
}

function openClearAllModal() {
  if (tasks.length === 0) return;
  confirmModal.classList.remove("hidden");
}

function closeClearAllModal() {
  confirmModal.classList.add("hidden");
}

async function confirmClearAll() {
  const idsToDelete = tasks.map((t) => t.id);
  tasks = [];
  editingTaskId = null;
  saveTasksToStorage();

  // Remove from Firestore
  idsToDelete.forEach((id) => removeTaskFromFirestore(id));

  closeClearAllModal();
  renderApp();
}

/* ==========================================================================
   5. Filtering, Searching, and Statistics
   ========================================================================== */

function getVisibleTasks() {
  const todayStr = getTodayDateString();

  return tasks.filter((task) => {
    if (activeView === "tasks" && task.completed) return false;
    if (activeView === "completed" && !task.completed) return false;
    if (activeView === "today" && task.dueDate !== todayStr) return false;
    if (activeView === "upcoming" && (!task.dueDate || task.dueDate <= todayStr)) return false;

    if (statusFilter === "pending" && task.completed) return false;
    if (statusFilter === "completed" && !task.completed) return false;

    if (searchQuery) {
      const matchTitle = task.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchTitle) return false;
    }

    return true;
  });
}

function updateStatistics() {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  statTotalEl.textContent = total;
  statPendingEl.textContent = pending;
  statCompletedEl.textContent = completed;
  progressPercentageLabel.textContent = `${percentage}%`;

  const circumference = 175.93;
  const offset = circumference - (percentage / 100) * circumference;
  circleProgress.style.strokeDashoffset = offset;

  if (total === 0) {
    progressStatusCaption.textContent = "No active tasks";
  } else if (percentage === 100) {
    progressStatusCaption.textContent = "All tasks completed! Excellent work.";
  } else {
    progressStatusCaption.textContent = `${completed} of ${total} tasks finished`;
  }

  sidebarProgressLabel.textContent = `${percentage}%`;
  sidebarProgressBar.style.width = `${percentage}%`;
  sidebarProgressCaption.textContent =
    percentage === 100 ? "Goal accomplished!" : `${pending} tasks pending today`;

  const todayStr = getTodayDateString();
  navCountAll.textContent = total;
  navCountPending.textContent = pending;
  navCountCompleted.textContent = completed;
  navCountToday.textContent = tasks.filter((t) => t.dueDate === todayStr && !t.completed).length;
  navCountUpcoming.textContent = tasks.filter((t) => t.dueDate > todayStr && !t.completed).length;

  clearTasksBtn.disabled = total === 0;
  clearTasksBtn.style.opacity = total === 0 ? "0.4" : "1";
  clearTasksBtn.style.pointerEvents = total === 0 ? "none" : "auto";
}

/* ==========================================================================
   6. UI Rendering
   ========================================================================== */

function createTaskNode(task) {
  const li = document.createElement("li");
  li.className = `task-item ${task.completed ? "completed" : ""}`;
  li.dataset.id = task.id;

  const isEditing = editingTaskId === task.id;

  const leftDiv = document.createElement("div");
  leftDiv.className = "task-item-left";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "custom-checkbox";
  checkboxLabel.setAttribute("aria-label", `Mark ${task.title} as ${task.completed ? "pending" : "completed"}`);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.addEventListener("change", () => toggleTaskStatus(task.id));

  const checkmark = document.createElement("span");
  checkmark.className = "checkmark";

  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(checkmark);
  leftDiv.appendChild(checkboxLabel);

  if (isEditing) {
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "inline-edit-input";
    editInput.value = task.title;
    editInput.maxLength = 200;

    editInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveEdit(task.id, editInput.value);
      if (e.key === "Escape") cancelEdit();
    });

    leftDiv.appendChild(editInput);

    setTimeout(() => {
      editInput.focus();
      editInput.select();
    }, 0);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "task-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "edit-action-btn edit-save-btn";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => saveEdit(task.id, editInput.value));

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "edit-action-btn edit-cancel-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", cancelEdit);

    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);

    li.appendChild(leftDiv);
    li.appendChild(actionsDiv);
  } else {
    const contentDiv = document.createElement("div");
    contentDiv.className = "task-content";

    const titleSpan = document.createElement("span");
    titleSpan.className = "task-title";
    titleSpan.textContent = task.title;
    contentDiv.appendChild(titleSpan);

    const metaDiv = document.createElement("div");
    metaDiv.className = "task-meta-tags";

    const priorityTag = document.createElement("span");
    priorityTag.className = `priority-tag priority-${task.priority}`;
    priorityTag.textContent = `${task.priority} Priority`;
    metaDiv.appendChild(priorityTag);

    if (task.dueDate) {
      const dateTag = document.createElement("span");
      dateTag.className = "date-tag";
      dateTag.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>${formatDueDate(task.dueDate)}</span>
      `;
      metaDiv.appendChild(dateTag);
    }

    contentDiv.appendChild(metaDiv);
    leftDiv.appendChild(contentDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "task-btn btn-edit";
    editBtn.title = "Edit task";
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
    editBtn.addEventListener("click", () => startEdit(task.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "task-btn btn-delete";
    deleteBtn.title = "Delete task";
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(leftDiv);
    li.appendChild(actionsDiv);
  }

  return li;
}

function formatDueDate(dateString) {
  if (!dateString) return "";
  const today = getTodayDateString();

  if (dateString === today) return "Due Today";

  const target = new Date(dateString + "T00:00:00");
  const options = { month: "short", day: "numeric" };
  return `Due ${target.toLocaleDateString("en-US", options)}`;
}

function renderTaskList() {
  const visibleTasks = getVisibleTasks();
  taskListEl.innerHTML = "";

  currentViewCount.textContent = `${visibleTasks.length} ${visibleTasks.length === 1 ? "item" : "items"}`;

  if (visibleTasks.length === 0) {
    emptyStateBox.classList.remove("hidden");

    if (searchQuery) {
      emptyHeadline.textContent = "No matching tasks found";
      emptyDesc.textContent = `No tasks matching "${searchQuery}". Try searching for another keyword.`;
    } else if (activeView === "completed") {
      emptyHeadline.textContent = "No completed tasks yet";
      emptyDesc.textContent = "Finished tasks will appear here. Complete a task to build your score.";
    } else if (activeView === "today") {
      emptyHeadline.textContent = "No tasks scheduled for today";
      emptyDesc.textContent = "You're all caught up for today! Add a task above to schedule work.";
    } else if (activeView === "upcoming") {
      emptyHeadline.textContent = "No upcoming deadlines";
      emptyDesc.textContent = "Assign a future due date when adding a task to track upcoming work.";
    } else {
      emptyHeadline.textContent = "Your workspace is clear";
      emptyDesc.textContent = "No tasks right now. Use the form above to add your first task.";
    }
    return;
  }

  emptyStateBox.classList.add("hidden");

  visibleTasks.forEach((task) => {
    const node = createTaskNode(task);
    taskListEl.appendChild(node);
  });
}

function renderApp() {
  updateStatistics();
  renderTaskList();
}

function showError(msg) {
  creatorErrorMsg.textContent = msg;
}

function clearError() {
  creatorErrorMsg.textContent = "";
}

/* ==========================================================================
   7. Event Listeners & Interactions
   ========================================================================== */

createTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(taskTitleInput.value, taskPriorityInput.value, taskDateInput.value);
});

taskTitleInput.addEventListener("input", () => {
  if (creatorErrorMsg.textContent) clearError();
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");

    activeView = link.dataset.view;
    editingTaskId = null;

    const viewTitles = {
      overview: "Dashboard Overview",
      tasks: "My Tasks",
      today: "Today's Tasks",
      upcoming: "Upcoming Tasks",
      completed: "Completed Tasks"
    };
    currentViewTitle.textContent = viewTitles[activeView] || "Dashboard Overview";

    closeMobileSidebar();
    renderTaskList();
  });
});

pillButtons.forEach((pill) => {
  pill.addEventListener("click", () => {
    pillButtons.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");

    statusFilter = pill.dataset.statusFilter;
    editingTaskId = null;
    renderTaskList();
  });
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  if (searchQuery.length > 0) {
    clearSearchBtn.classList.remove("hidden");
  } else {
    clearSearchBtn.classList.add("hidden");
  }
  renderTaskList();
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearchBtn.classList.add("hidden");
  renderTaskList();
  searchInput.focus();
});

notificationBtn.addEventListener("click", toggleNotifications);

document.addEventListener("click", (e) => {
  if (!notificationWrapperContains(e.target)) {
    notificationDropdown.classList.add("hidden");
  }
});

function notificationWrapperContains(target) {
  return notificationBtn.contains(target) || notificationDropdown.contains(target);
}

clearTasksBtn.addEventListener("click", openClearAllModal);
modalCancelBtn.addEventListener("click", closeClearAllModal);
modalConfirmBtn.addEventListener("click", confirmClearAll);

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeClearAllModal();
});

function openMobileSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
}

function closeMobileSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
}

mobileMenuBtn.addEventListener("click", openMobileSidebar);
sidebarCloseBtn.addEventListener("click", closeMobileSidebar);
sidebarOverlay.addEventListener("click", closeMobileSidebar);
