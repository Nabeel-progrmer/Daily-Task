import { useEffect, useMemo, useState } from "react";
import Auth from "./Auth.jsx";
import "./App.css";

const STORAGE_KEY = "taskflow_tasks_v1";
const SETTINGS_KEY = "taskflow_settings_v1";

const categories = [
  { id: "work", name: "Work", icon: "💼" },
  { id: "study", name: "Study", icon: "📚" },
  { id: "personal", name: "Personal", icon: "🏠" },
  { id: "health", name: "Health", icon: "❤️" },
  { id: "fitness", name: "Fitness", icon: "🏃" },
  { id: "other", name: "Other", icon: "📌" },
];

const priorities = [
  { id: "low", label: "Low", color: "low" },
  { id: "medium", label: "Medium", color: "medium" },
  { id: "high", label: "High", color: "high" },
];

const emptyTask = {
  title: "",
  description: "",
  date: new Date().toISOString().split("T")[0],
  time: "",
  category: "personal",
  priority: "medium",
  recurring: "none",
  important: false,
};

function getTaskStorageKey(userId) {
  return `${STORAGE_KEY}:${userId}`;
}

function getInitialTasks(storageKey = STORAGE_KEY) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);

    if (storageKey !== STORAGE_KEY) {
      const legacyTasks = localStorage.getItem(STORAGE_KEY);
      if (legacyTasks) {
        const tasks = JSON.parse(legacyTasks);
        localStorage.setItem(storageKey, JSON.stringify(tasks));
        localStorage.removeItem(STORAGE_KEY);
        return tasks;
      }
    }

    return [];
  } catch {
    return [];
  }
}

function getInitialSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved
      ? JSON.parse(saved)
      : {
          theme: "light",
        };
  } catch {
    return { theme: "light" };
  }
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isToday(dateString) {
  const today = new Date().toISOString().split("T")[0];
  return dateString === today;
}

function getTaskStatus(task) {
  if (task.completed) return "completed";

  const today = new Date().toISOString().split("T")[0];

  if (task.date < today) return "overdue";

  if (task.date === today) return "today";

  return "upcoming";
}

function getStartOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(getInitialSettings);
  const [auth, setAuth] = useState({ status: "checking", user: null });

  const [activeView, setActiveView] = useState("today");
  const [activeFilter, setActiveFilter] = useState("all");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTask);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (auth.status !== "signed-in") return;

    localStorage.setItem(
      getTaskStorageKey(auth.user.id),
      JSON.stringify(tasks)
    );
  }, [tasks, auth]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });
        const result = await response.json();

        if (!response.ok || !result.user?.id) {
          throw new Error("Session expired.");
        }

        if (cancelled) return;
        setTasks(getInitialTasks(getTaskStorageKey(result.user.id)));
        setAuth({ status: "signed-in", user: result.user });
      } catch {
        if (cancelled) return;
        setTasks([]);
        setAuth({ status: "signed-out", user: null });
      } finally {
        localStorage.removeItem("taskflow_jwt");
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.body.className = settings.theme === "dark" ? "dark-mode" : "";
  }, [settings]);

  const taskData = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const weekStart = getStartOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const todayTasks = [];
    const weekTasks = [];
    const monthTasks = [];
    const overdueTasks = [];
    const importantTasks = [];
    const categoryCounts = new Map(categories.map(({ id }) => [id, 0]));
    const tasksByDate = new Map();
    let completedCount = 0;

    for (const task of tasks) {
      const taskDate = new Date(`${task.date}T00:00:00`);

      if (task.completed) {
        completedCount++;
      } else {
        categoryCounts.set(
          task.category,
          (categoryCounts.get(task.category) || 0) + 1
        );
      }

      const dayCounts = tasksByDate.get(task.date) || {
        total: 0,
        completed: 0,
      };
      dayCounts.total++;
      if (task.completed) dayCounts.completed++;
      tasksByDate.set(task.date, dayCounts);

      if (task.date === today) todayTasks.push(task);
      if (taskDate >= weekStart && taskDate < weekEnd) weekTasks.push(task);
      if (
        taskDate.getMonth() === now.getMonth() &&
        taskDate.getFullYear() === now.getFullYear()
      ) {
        monthTasks.push(task);
      }
      if (!task.completed && task.date < today) overdueTasks.push(task);
      if (task.important && !task.completed) importantTasks.push(task);
    }

    return {
      todayTasks,
      weekTasks,
      monthTasks,
      overdueTasks,
      importantTasks,
      categoryCounts,
      tasksByDate,
      completedCount,
    };
  }, [tasks]);

  const {
    todayTasks,
    weekTasks,
    monthTasks,
    overdueTasks,
    importantTasks,
  } = taskData;

  const activeViewTasks = useMemo(() => {
    switch (activeView) {
      case "today":
        return todayTasks;
      case "week":
        return weekTasks;
      case "month":
        return monthTasks;
      case "important":
        return importantTasks;
      case "overdue":
        return overdueTasks;
      case "all":
      default:
        return tasks;
    }
  }, [activeView, todayTasks, weekTasks, monthTasks, importantTasks, overdueTasks, tasks]);

  const viewTaskCounts = useMemo(
    () =>
      activeViewTasks.reduce(
        (counts, task) => {
          counts.total++;
          counts[task.completed ? "completed" : "active"]++;
          return counts;
        },
        { total: 0, active: 0, completed: 0 }
      ),
    [activeViewTasks]
  );

  const filteredTasks = useMemo(() => {
    let result = activeViewTasks;

    if (activeFilter === "active") {
      result = result.filter((task) => !task.completed);
    }

    if (activeFilter === "completed") {
      result = result.filter((task) => task.completed);
    }

    if (categoryFilter !== "all") {
      result = result.filter((task) => task.category === categoryFilter);
    }

    if (priorityFilter !== "all") {
      result = result.filter((task) => task.priority === priorityFilter);
    }

    if (search.trim()) {
      const query = search.toLowerCase();

      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
    }

    return [...result].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      if (a.important !== b.important) {
        return a.important ? -1 : 1;
      }

      const priorityOrder = {
        high: 0,
        medium: 1,
        low: 2,
      };

      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      return `${a.date}${a.time || ""}`.localeCompare(
        `${b.date}${b.time || ""}`
      );
    });
  }, [
    activeViewTasks,
    activeFilter,
    categoryFilter,
    priorityFilter,
    search,
  ]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = taskData.completedCount;
    const pending = total - completed;

    const todayTotal = todayTasks.length;
    const todayCompleted = todayTasks.filter((task) => task.completed).length;

    const weekTotal = weekTasks.length;
    const weekCompleted = weekTasks.filter((task) => task.completed).length;

    const monthTotal = monthTasks.length;
    const monthCompleted = monthTasks.filter(
      (task) => task.completed
    ).length;

    return {
      total,
      completed,
      pending,
      todayTotal,
      todayCompleted,
      weekTotal,
      weekCompleted,
      monthTotal,
      monthCompleted,
      todayPercentage: todayTotal
        ? Math.round((todayCompleted / todayTotal) * 100)
        : 0,
      weekPercentage: weekTotal
        ? Math.round((weekCompleted / weekTotal) * 100)
        : 0,
      monthPercentage: monthTotal
        ? Math.round((monthCompleted / monthTotal) * 100)
        : 0,
    };
  }, [tasks.length, taskData, todayTasks, weekTasks, monthTasks]);

  const streak = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    let latestTaskDate = "";

    for (const date of taskData.tasksByDate.keys()) {
      if (date <= today && date > latestTaskDate) latestTaskDate = date;
    }

    if (!latestTaskDate) return 0;

    let count = 0;
    const date = new Date(`${latestTaskDate}T00:00:00Z`);

    while (true) {
      const dayCounts = taskData.tasksByDate.get(
        date.toISOString().split("T")[0]
      );

      if (!dayCounts || dayCounts.completed !== dayCounts.total) break;

      count++;
      date.setUTCDate(date.getUTCDate() - 1);
    }

    return count;
  }, [taskData.tasksByDate]);

  const updateForm = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openAddModal = (date = null) => {
    setEditingId(null);

    setForm({
      ...emptyTask,
      date: date || new Date().toISOString().split("T")[0],
    });

    setShowModal(true);
  };

  const openEditModal = (task) => {
    setEditingId(task.id);

    setForm({
      title: task.title,
      description: task.description || "",
      date: task.date,
      time: task.time || "",
      category: task.category || "personal",
      priority: task.priority || "medium",
      recurring: task.recurring || "none",
      important: task.important || false,
    });

    setShowModal(true);
  };

  const saveTask = (e) => {
    e.preventDefault();

    if (!form.title.trim()) return;

    if (editingId) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editingId
            ? {
                ...task,
                ...form,
              }
            : task
        )
      );
    } else {
      const newTask = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
      };

      setTasks((prev) => [newTask, ...prev]);
    }

    setShowModal(false);
    setForm(emptyTask);
    setEditingId(null);
  };

  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;

        const completed = !task.completed;

        return {
          ...task,
          completed,
          completedAt: completed ? new Date().toISOString() : null,
        };
      })
    );
  };

  const toggleImportant = (id) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              important: !task.important,
            }
          : task
      )
    );
  };

  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((task) => !task.completed));
  };

  const clearAll = () => {
    if (!window.confirm("Delete all tasks? This cannot be undone.")) return;

    setTasks([]);
  };

  const changeTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === "light" ? "dark" : "light",
    }));
  };

  const completeAuthentication = ({ user }) => {
    if (!user?.id) {
      throw new Error("The server returned an invalid authentication response.");
    }

    setTasks(getInitialTasks(getTaskStorageKey(user.id)));
    setAuth({ status: "signed-in", user });
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setTasks([]);
    setAuth({ status: "signed-out", user: null });
  };

  const getCategory = (id) =>
    categories.find((category) => category.id === id) || categories[5];

  const getViewTitle = () => {
    switch (activeView) {
      case "today":
        return "Today's Tasks";
      case "week":
        return "This Week";
      case "month":
        return "This Month";
      case "important":
        return "Important Tasks";
      case "overdue":
        return "Overdue Tasks";
      case "all":
        return "All Tasks";
      default:
        return "Tasks";
    }
  };

  const progressCircle = (percentage) => {
    return {
      background: `conic-gradient(var(--primary) ${percentage}%, var(--border) ${percentage}% 100%)`,
    };
  };

  const weekDays = useMemo(() => {
    const start = getStartOfWeek();

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);

      const dateString = date.toISOString().split("T")[0];

      const dayTasks = taskData.tasksByDate.get(dateString) || {
        total: 0,
        completed: 0,
      };

      return {
        name: date.toLocaleDateString("en-US", { weekday: "short" }),
        number: date.getDate(),
        date: dateString,
        total: dayTasks.total,
        completed: dayTasks.completed,
        today: isToday(dateString),
      };
    });
  }, [taskData.tasksByDate]);

  if (auth.status !== "signed-in") {
    if (auth.status === "checking") {
      return <div className="auth-loading">Loading your planner...</div>;
    }

    return <Auth onAuthenticated={completeAuthentication} />;
  }

  const userInitials = (auth.user.name || auth.user.email || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="app">
      <aside
        id="primary-sidebar"
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
      >
        <div className="brand">
          <div className="brand-icon">✓</div>

          <div>
            <h1>TaskFlow</h1>
            <span>Personal Planner</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            ×
          </button>
        </div>

        <button className="add-task-button" onClick={() => openAddModal()}>
          <span>＋</span>
          Add New Task
        </button>

        <nav className="navigation">
          <p className="nav-label">PLAN</p>

          <button
            className={activeView === "today" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveView("today");
              setSidebarOpen(false);
            }}
          >
            <span>☀️</span>
            Today
            <b>{todayTasks.length}</b>
          </button>

          <button
            className={activeView === "week" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveView("week");
              setSidebarOpen(false);
            }}
          >
            <span>📅</span>
            This Week
            <b>{weekTasks.length}</b>
          </button>

          <button
            className={activeView === "month" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveView("month");
              setSidebarOpen(false);
            }}
          >
            <span>🗓️</span>
            This Month
            <b>{monthTasks.length}</b>
          </button>

          <button
            className={
              activeView === "important" ? "nav-item active" : "nav-item"
            }
            onClick={() => {
              setActiveView("important");
              setSidebarOpen(false);
            }}
          >
            <span>⭐</span>
            Important
            <b>{importantTasks.length}</b>
          </button>

          <button
            className={
              activeView === "overdue" ? "nav-item active" : "nav-item"
            }
            onClick={() => {
              setActiveView("overdue");
              setSidebarOpen(false);
            }}
          >
            <span>⚠️</span>
            Overdue
            <b className="danger-count">{overdueTasks.length}</b>
          </button>

          <button
            className={activeView === "all" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveView("all");
              setSidebarOpen(false);
            }}
          >
            <span>📋</span>
            All Tasks
            <b>{tasks.length}</b>
          </button>
        </nav>

        <div className="sidebar-section">
          <p className="nav-label">CATEGORIES</p>

          {categories.map((category) => {
            const count = taskData.categoryCounts.get(category.id) || 0;

            return (
              <button
                key={category.id}
                className="category-item"
                onClick={() => {
                  setCategoryFilter(category.id);
                  setActiveView("all");
                  setSidebarOpen(false);
                }}
              >
                <span>{category.icon}</span>
                {category.name}
                {count > 0 && <b>{count}</b>}
              </button>
            );
          })}
        </div>

        <div className="sidebar-bottom">
          <div className="streak-box">
            <div className="streak-icon">🔥</div>
            <div>
              <strong>{streak} day streak</strong>
              <span>Keep going!</span>
            </div>
          </div>

          <button className="sidebar-option" onClick={changeTheme}>
            <span>{settings.theme === "light" ? "🌙" : "☀️"}</span>
            {settings.theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>

          <button className="sidebar-option" onClick={signOut}>
            <span aria-hidden="true">↪</span>
            Logout
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              aria-controls="primary-sidebar"
            >
              ☰
            </button>

            <strong>TaskFlow</strong>
          </div>

          <div className="top-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
            />

            {search && (
              <button onClick={() => setSearch("")} className="clear-search">
                ×
              </button>
            )}
          </div>

          <div className="top-actions">
            <button
              className="icon-button"
              onClick={changeTheme}
              title="Toggle theme"
            >
              {settings.theme === "light" ? "🌙" : "☀️"}
            </button>

            <button
              className="profile-button"
              title={`Signed in as ${auth.user.email}. Sign out`}
              aria-label={`Sign out ${auth.user.name || auth.user.email}`}
              onClick={signOut}
            >
              {userInitials}
            </button>
          </div>
        </header>

        <div className="content">
          <section className="welcome-section">
            <div>
              <p className="eyebrow">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>

              <h2>
                Good {new Date().getHours() < 12 ? "morning" : "afternoon"} 👋
              </h2>

              <p className="welcome-text">
                Stay focused and get your important work done.
              </p>
            </div>

            <button
              className="primary-button desktop-add"
              onClick={() => openAddModal()}
            >
              <span>＋</span>
              New Task
            </button>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">✓</div>
              <div>
                <span>Completed</span>
                <strong>{stats.completed}</strong>
              </div>
              <small>of {stats.total} total</small>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">◷</div>
              <div>
                <span>Pending</span>
                <strong>{stats.pending}</strong>
              </div>
              <small>tasks left</small>
            </div>

            <div className="stat-card">
              <div className="stat-icon red">⚠</div>
              <div>
                <span>Overdue</span>
                <strong>{overdueTasks.length}</strong>
              </div>
              <small>need attention</small>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">🔥</div>
              <div>
                <span>Streak</span>
                <strong>{streak}</strong>
              </div>
              <small>days completed</small>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="progress-card">
              <div className="card-heading">
                <div>
                  <span className="card-label">TODAY'S PROGRESS</span>
                  <h3>Daily productivity</h3>
                </div>

                <span className="percentage-label">
                  {stats.todayPercentage}%
                </span>
              </div>

              <div className="progress-content">
                <div
                  className="progress-circle"
                  style={progressCircle(stats.todayPercentage)}
                >
                  <div>
                    <strong>{stats.todayCompleted}</strong>
                    <span>of {stats.todayTotal}</span>
                  </div>
                </div>

                <div className="progress-details">
                  <div>
                    <span>Completed today</span>
                    <strong>{stats.todayCompleted}</strong>
                  </div>

                  <div>
                    <span>Remaining</span>
                    <strong>
                      {Math.max(stats.todayTotal - stats.todayCompleted, 0)}
                    </strong>
                  </div>

                  <div>
                    <span>Weekly progress</span>
                    <strong>{stats.weekPercentage}%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="week-card">
              <div className="card-heading">
                <div>
                  <span className="card-label">THIS WEEK</span>
                  <h3>Your week at a glance</h3>
                </div>
              </div>

              <div className="week-days">
                {weekDays.map((day) => {
                  const percentage = day.total
                    ? (day.completed / day.total) * 100
                    : 0;

                  return (
                    <button
                      key={day.date}
                      className={`week-day ${day.today ? "today" : ""}`}
                      onClick={() => {
                        setActiveView("all");
                        setSearch("");
                        openAddModal(day.date);
                      }}
                    >
                      <span>{day.name}</span>
                      <strong>{day.number}</strong>

                      <div className="day-progress">
                        <i style={{ width: `${percentage}%` }} />
                      </div>

                      <small>
                        {day.completed}/{day.total}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="task-section">
            <div className="task-header">
              <div>
                <span className="card-label">TASK MANAGEMENT</span>
                <h3>{getViewTitle()}</h3>
              </div>

              <div className="task-actions">
                <button
                  className={`filter-toggle ${
                    showFilters ? "active" : ""
                  }`}
                  onClick={() => setShowFilters((prev) => !prev)}
                >
                  ⚙ Filters
                </button>

                <button
                  className="primary-button small"
                  onClick={() => openAddModal()}
                >
                  ＋ Add
                </button>
              </div>
            </div>

            <div className="task-toolbar">
              <div className="tabs">
                <button
                  className={activeFilter === "all" ? "tab active" : "tab"}
                  onClick={() => setActiveFilter("all")}
                >
                  All
                  <span>{viewTaskCounts.total}</span>
                </button>

                <button
                  className={activeFilter === "active" ? "tab active" : "tab"}
                  onClick={() => setActiveFilter("active")}
                >
                  Active
                  <span>
                    {viewTaskCounts.active}
                  </span>
                </button>

                <button
                  className={
                    activeFilter === "completed" ? "tab active" : "tab"
                  }
                  onClick={() => setActiveFilter("completed")}
                >
                  Completed
                  <span>
                    {viewTaskCounts.completed}
                  </span>
                </button>
              </div>

              {showFilters && (
                <div className="filters">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>

                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">All Priorities</option>

                    {priorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.label}
                      </option>
                    ))}
                  </select>

                  {(categoryFilter !== "all" ||
                    priorityFilter !== "all") && (
                    <button
                      className="reset-filter"
                      onClick={() => {
                        setCategoryFilter("all");
                        setPriorityFilter("all");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="tasks-list">
              {filteredTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✓</div>

                  <h3>
                    {search
                      ? "No tasks found"
                      : activeFilter === "completed"
                      ? "No completed tasks"
                      : "You're all caught up!"}
                  </h3>

                  <p>
                    {search
                      ? "Try searching for something else."
                      : "Create a task and start making progress."}
                  </p>

                  {!search && (
                    <button
                      className="primary-button"
                      onClick={() => openAddModal()}
                    >
                      ＋ Create Task
                    </button>
                  )}
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const category = getCategory(task.category);
                  const status = getTaskStatus(task);

                  return (
                    <article
                      className={`task-card ${
                        task.completed ? "completed" : ""
                      } ${status === "overdue" ? "overdue" : ""}`}
                      key={task.id}
                    >
                      <button
                        className={`check-button ${
                          task.completed ? "checked" : ""
                        }`}
                        onClick={() => toggleTask(task.id)}
                        title={
                          task.completed
                            ? "Mark as active"
                            : "Complete task"
                        }
                      >
                        {task.completed ? "✓" : ""}
                      </button>

                      <div className="task-main">
                        <div className="task-title-row">
                          <h4>{task.title}</h4>

                          {task.important && (
                            <span className="important-badge">★</span>
                          )}
                        </div>

                        {task.description && (
                          <p className="task-description">
                            {task.description}
                          </p>
                        )}

                        <div className="task-meta">
                          <span className="category-badge">
                            {category.icon} {category.name}
                          </span>

                          <span
                            className={`priority-badge ${task.priority}`}
                          >
                            <i />
                            {task.priority}
                          </span>

                          <span className="date-meta">
                            📅 {formatDate(task.date)}
                          </span>

                          {task.time && (
                            <span className="date-meta">
                              🕐 {task.time}
                            </span>
                          )}

                          {task.recurring !== "none" && (
                            <span className="recurring-badge">
                              ↻ {task.recurring}
                            </span>
                          )}

                          {status === "overdue" && (
                            <span className="overdue-badge">
                              Overdue
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="task-menu">
                        <button
                          onClick={() => toggleImportant(task.id)}
                          className={
                            task.important
                              ? "task-icon active"
                              : "task-icon"
                          }
                          title="Important"
                        >
                          ★
                        </button>

                        <button
                          onClick={() => openEditModal(task)}
                          className="task-icon"
                          title="Edit"
                        >
                          ✎
                        </button>

                        <button
                          onClick={() => deleteTask(task.id)}
                          className="task-icon delete"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {tasks.some((task) => task.completed) && (
              <div className="task-footer">
                <span>
                  {taskData.completedCount} completed task
                  {taskData.completedCount !== 1 ? "s" : ""}
                </span>

                <button onClick={clearCompleted}>
                  Clear completed
                </button>
              </div>
            )}
          </section>

          <section className="insights-section">
            <div className="insight-card">
              <div className="insight-icon">📊</div>

              <div>
                <span>Monthly completion</span>
                <strong>{stats.monthPercentage}%</strong>
              </div>

              <div className="mini-progress">
                <i style={{ width: `${stats.monthPercentage}%` }} />
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-icon">🎯</div>

              <div>
                <span>Monthly tasks</span>
                <strong>{stats.monthTotal}</strong>
              </div>

              <small>
                {stats.monthCompleted} completed this month
              </small>
            </div>

            <div className="insight-card">
              <div className="insight-icon">⚡</div>

              <div>
                <span>High priority</span>
                <strong>
                  {tasks.filter(
                    (task) => task.priority === "high" && !task.completed
                  ).length}
                </strong>
              </div>

              <small>tasks need attention</small>
            </div>
          </section>

          <footer className="footer">
            <span>TaskFlow</span>
            <span>•</span>
            <span>Your tasks are stored locally on this device.</span>

            <button onClick={clearAll}>Clear all data</button>
          </footer>
        </div>
      </main>

      {showModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="card-label">
                  {editingId ? "EDIT TASK" : "NEW TASK"}
                </span>

                <h3>
                  {editingId ? "Update your task" : "Create a new task"}
                </h3>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveTask}>
              <div className="form-group">
                <label>Task title *</label>

                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                  placeholder="e.g. Complete React project"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>

                <textarea
                  value={form.description}
                  onChange={(e) =>
                    updateForm("description", e.target.value)
                  }
                  placeholder="Add some details about this task..."
                  rows="3"
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Due date</label>

                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm("date", e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Time</label>

                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => updateForm("time", e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Category</label>

                  <select
                    value={form.category}
                    onChange={(e) =>
                      updateForm("category", e.target.value)
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>

                  <select
                    value={form.priority}
                    onChange={(e) =>
                      updateForm("priority", e.target.value)
                    }
                  >
                    {priorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Repeat task</label>

                <select
                  value={form.recurring}
                  onChange={(e) =>
                    updateForm("recurring", e.target.value)
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>

              <label className="important-toggle">
                <input
                  type="checkbox"
                  checked={form.important}
                  onChange={(e) =>
                    updateForm("important", e.target.checked)
                  }
                />

                <span className="custom-checkbox">
                  {form.important ? "✓" : ""}
                </span>

                <span>
                  <strong>Mark as important</strong>
                  <small>
                    Keep this task visible in your Important list.
                  </small>
                </span>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button">
                  {editingId ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;