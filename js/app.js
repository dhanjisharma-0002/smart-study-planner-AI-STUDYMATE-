/**
 * Smart Study Planner - Client Application Logic
 * Comprehensive Architecture:
 * - Requirement 1: Task Management (Add, Edit in-place, Delete)
 * - Requirement 2: Task Details (Subject, Deadline, Duration, Priority validated)
 * - Requirement 3: Actual LLM Study-Plan Generation with Secure Backend Proxy & Validation
 *   (Falls back safely to local deterministic scheduler when uncredentialed; honestly labeled)
 * - Requirement 4: Dual Schedule Display (Chronological Timeline & Hourly Day Calendar)
 * - Requirement 5: Consistent Completion Tracking across all views
 * - Requirement 6: Strict Validation (Missing/invalid deadlines, negative/zero durations, past deadlines)
 * - Strict adherence to the 5-color palette (Aqua, Off-white, Deep Teal, Mist Teal, Charcoal)
 */

(function () {
  'use strict';

  // --- Initial State Keys ---
  const STORAGE_KEY = 'smart_study_planner_tasks';
  const STORAGE_HOURS_KEY = 'smart_study_planner_hours';

  // Sample seed tasks to showcase the UI immediately on first load
  const defaultTasks = [
    {
      id: 'task-1',
      subject: 'Advanced Calculus',
      deadline: getRelativeDateTime(1, 14, 0), // Tomorrow 14:00
      duration: 60,
      priority: 'high',
      completed: false,
    },
    {
      id: 'task-2',
      subject: 'Organic Chemistry Reactions',
      deadline: getRelativeDateTime(2, 17, 30), // In 2 days 17:30
      duration: 45,
      priority: 'medium',
      completed: false,
    },
    {
      id: 'task-3',
      subject: 'Computer Systems Architecture',
      deadline: getRelativeDateTime(3, 10, 0), // In 3 days 10:00
      duration: 90,
      priority: 'high',
      completed: false,
    },
    {
      id: 'task-4',
      subject: 'Academic Literature Review',
      deadline: getRelativeDateTime(0, 18, 0), // Today 18:00
      duration: 30,
      priority: 'low',
      completed: true,
    }
  ];

  let tasks = loadTasks();
  let availableHours = loadAvailableHours();
  let currentFilter = 'all';
  let currentScheduleView = 'timeline'; // 'timeline' or 'calendar'
  let editingTaskId = null;
  let activeEngineMode = 'deterministic'; // 'llm_gemini', 'llm_openai', or 'deterministic'

  // --- DOM Elements ---
  const form = document.getElementById('study-task-form');
  const editingTaskIdInput = document.getElementById('editing-task-id');
  const formCardTitle = document.getElementById('form-card-title');
  const formCardDesc = document.getElementById('form-card-desc');
  const formSubmitBtn = document.getElementById('form-submit-btn');
  const formSubmitText = document.getElementById('form-submit-text');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const resetTaskBtn = document.getElementById('reset-task-btn');

  const subjectInput = document.getElementById('task-subject');
  const deadlineInput = document.getElementById('task-deadline');
  const durationInput = document.getElementById('task-duration');
  const durationChips = document.querySelectorAll('.chip-btn');

  const subjectError = document.getElementById('subject-error');
  const deadlineError = document.getElementById('deadline-error');
  const durationError = document.getElementById('duration-error');

  const taskListContainer = document.getElementById('tasks-list-container');
  const progressBar = document.getElementById('task-progress-bar');
  const progressPercentageLabel = document.getElementById('progress-percentage-label');
  const tasksCompletedCount = document.getElementById('tasks-completed-count');
  const totalStudyTime = document.getElementById('total-study-time');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const headerDateText = document.getElementById('header-date-text');

  // Engine Badges & Controls
  const engineBadge = document.querySelector('.engine-badge');
  const availableHoursInput = document.getElementById('available-study-hours');
  const hoursPresetButtons = document.querySelectorAll('.hours-chip-btn');
  const allocationStatsText = document.getElementById('allocation-stats-text');
  const allocationCapacityBadge = document.getElementById('allocation-capacity-badge');
  const allocationFill = document.getElementById('allocation-fill');
  const generatePlanBtn = document.getElementById('generate-plan-btn');
  const generatePlanBtnText = document.getElementById('generate-plan-btn-text');

  // Conflict Banner & Unscheduled Section
  const conflictBanner = document.getElementById('conflict-banner');
  const conflictBannerTitle = document.getElementById('conflict-banner-title');
  const conflictList = document.getElementById('conflict-list');
  const unscheduledSection = document.getElementById('unscheduled-section');
  const unscheduledCountTag = document.getElementById('unscheduled-count-tag');
  const unscheduledList = document.getElementById('unscheduled-list');

  // Schedule Timeline & Calendar View Elements
  const scheduleTimeline = document.getElementById('daily-schedule-timeline');
  const scheduleCalendarGrid = document.getElementById('daily-schedule-calendar');
  const scheduleBlockCount = document.getElementById('schedule-block-count');
  const viewTimelineBtn = document.getElementById('view-timeline-btn');
  const viewCalendarBtn = document.getElementById('view-calendar-btn');

  // Sessions Container
  const sessionsContainer = document.getElementById('generated-sessions-container');
  const sessionsCounterBadge = document.getElementById('sessions-counter-badge');

  // Counts
  const countAll = document.getElementById('count-all');
  const countActive = document.getElementById('count-active');
  const countCompleted = document.getElementById('count-completed');

  // --- Helper Functions ---
  function getRelativeDateTime(dayOffset, hours, minutes) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hours, minutes, 0, 0);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hh}:${mm}`;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return 'No deadline';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return date.toLocaleDateString(undefined, options);
  }

  function formatHeaderDate() {
    const today = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return today.toLocaleDateString(undefined, options);
  }

  function loadTasks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage unavailable or parse error, using default state.', e);
    }
    return defaultTasks;
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }

  function loadAvailableHours() {
    try {
      const saved = localStorage.getItem(STORAGE_HOURS_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.5 && val <= 16) return val;
      }
    } catch (e) {
      console.warn('LocalStorage unavailable for hours.', e);
    }
    return 4.0;
  }

  function saveAvailableHours(hours) {
    try {
      localStorage.setItem(STORAGE_HOURS_KEY, String(hours));
    } catch (e) {
      console.warn('Failed to save available hours', e);
    }
  }

  // --- Form Validation & Error Handling ---

  function setFieldError(field, errorEl, message) {
    if (field) field.classList.add('is-invalid');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function clearFieldError(field, errorEl) {
    if (field) field.classList.remove('is-invalid');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
  }

  function clearAllErrors() {
    clearFieldError(subjectInput, subjectError);
    clearFieldError(deadlineInput, deadlineError);
    clearFieldError(durationInput, durationError);
  }

  function validateForm() {
    clearAllErrors();
    let isValid = true;
    let firstInvalidField = null;

    // 1. Subject validation (must not be empty or whitespace)
    const subject = String(subjectInput.value || '').trim();
    if (!subject) {
      setFieldError(subjectInput, subjectError, 'Subject or topic cannot be empty.');
      isValid = false;
      if (!firstInvalidField) firstInvalidField = subjectInput;
    }

    // 2. Deadline validation (must not be empty, must be valid date and in the future)
    const deadline = String(deadlineInput.value || '').trim();
    if (!deadline) {
      setFieldError(deadlineInput, deadlineError, 'Please provide a valid deadline date and time.');
      isValid = false;
      if (!firstInvalidField) firstInvalidField = deadlineInput;
    } else {
      const parsedDate = new Date(deadline);
      if (isNaN(parsedDate.getTime())) {
        setFieldError(deadlineInput, deadlineError, 'Please enter a valid date and time format.');
        isValid = false;
        if (!firstInvalidField) firstInvalidField = deadlineInput;
      } else if (parsedDate.getTime() < Date.now()) {
        setFieldError(deadlineInput, deadlineError, 'Deadline date and time cannot be in the past.');
        isValid = false;
        if (!firstInvalidField) firstInvalidField = deadlineInput;
      }
    }

    // 3. Duration validation (must be positive number > 0)
    const durationRaw = String(durationInput.value !== undefined && durationInput.value !== null ? durationInput.value : '').trim();
    const duration = Number(durationRaw);
    if (!durationRaw) {
      setFieldError(durationInput, durationError, 'Estimated duration is required.');
      isValid = false;
      if (!firstInvalidField) firstInvalidField = durationInput;
    } else if (isNaN(duration) || duration <= 0) {
      setFieldError(durationInput, durationError, 'Duration must be a positive number greater than 0 minutes.');
      isValid = false;
      if (!firstInvalidField) firstInvalidField = durationInput;
    }

    // 4. Priority validation (must be low, medium, or high)
    const selectedPriorityEl = document.querySelector('input[name="priority"]:checked');
    const priority = selectedPriorityEl ? selectedPriorityEl.value : '';
    const validPriorities = ['low', 'medium', 'high'];
    if (!priority || !validPriorities.includes(priority.toLowerCase())) {
      isValid = false;
    }

    if (!isValid && firstInvalidField) {
      firstInvalidField.focus();
    }

    return isValid;
  }

  // ==========================================================================
  // HYBRID SCHEDULING ORCHESTRATOR (LLM WITH DETERMINISTIC FALLBACK)
  // ==========================================================================

  async function generateStudyPlan() {
    const totalDailyBudgetMinutes = Math.round(availableHours * 60);
    const activeTasks = tasks.filter(t => !t.completed);

    if (generatePlanBtn) {
      generatePlanBtn.disabled = true;
      if (generatePlanBtnText) generatePlanBtnText.textContent = 'Generating Plan...';
    }

    try {
      // If there are active tasks, attempt to query the secure backend LLM bridge
      if (activeTasks.length > 0 && typeof fetch === 'function') {
        try {
          const response = await fetch('/api/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tasks: activeTasks,
              availableHours: availableHours
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.plan) {
              // Validate the LLM output strictly before displaying
              const validation = validateLLMPlanOutput(data.plan, activeTasks, totalDailyBudgetMinutes);
              if (validation.isValid) {
                activeEngineMode = data.engine || 'llm';
                updateEngineBadge(true, data.provider);
                updatePlanUI(validation.parsedPlan);
                return;
              } else {
                console.warn('LLM plan failed validation checks. Falling back to deterministic scheduler.', validation.reason);
              }
            }
          }
        } catch (err) {
          // Network or fetch failure -> fall through cleanly to deterministic fallback
          console.info('LLM endpoint not reachable. Using deterministic scheduler fallback.');
        }
      }

      // Deterministic Scheduler Fallback
      activeEngineMode = 'deterministic';
      updateEngineBadge(false);
      generateDeterministicStudyPlan();
    } finally {
      if (generatePlanBtn) {
        generatePlanBtn.disabled = false;
        if (generatePlanBtnText) generatePlanBtnText.textContent = 'Generate Study Plan';
      }
    }
  }

  function updateEngineBadge(isLLM, provider) {
    if (!engineBadge) return;
    if (isLLM) {
      engineBadge.textContent = `Engine: LLM (${provider ? provider.toUpperCase() : 'AI'})`;
      engineBadge.title = `Plan generated via authenticated ${provider} cloud model.`;
    } else {
      engineBadge.textContent = 'Engine: Deterministic Scheduler (Fallback)';
      engineBadge.title = 'No LLM API key detected in server environment. Set GEMINI_API_KEY in environment to enable cloud LLM generation.';
    }
  }

  async function checkInitialLLMStatus() {
    if (typeof fetch === 'function') {
      try {
        const res = await fetch('/api/llm-status');
        if (res.ok) {
          const data = await res.json();
          if (data && data.llmAvailable) {
            updateEngineBadge(true, data.provider);
          } else {
            updateEngineBadge(false);
          }
        }
      } catch (err) {
        // Fallback remains active
      }
    }
  }

  // --- Strict Validation of LLM-Generated Plan Output ---
  function validateLLMPlanOutput(plan, activeTasks, budgetMinutes) {
    if (!plan || typeof plan !== 'object') {
      return { isValid: false, reason: 'LLM plan is not an object.' };
    }

    const blocks = plan.scheduledBlocks;
    if (!Array.isArray(blocks)) {
      return { isValid: false, reason: 'scheduledBlocks is not an array.' };
    }

    let totalDuration = 0;
    const now = new Date();
    const scheduledBlocks = [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b.subject || !b.duration || b.duration <= 0) {
        return { isValid: false, reason: `Block ${i} has invalid duration or missing subject.` };
      }
      totalDuration += Number(b.duration);

      // Check deadline constraint
      if (b.deadline) {
        const dlnDate = new Date(b.deadline);
        if (!isNaN(dlnDate.getTime()) && dlnDate.getTime() < now.getTime()) {
          return { isValid: false, reason: `Block ${i} scheduled for an overdue deadline.` };
        }
      }

      scheduledBlocks.push({
        type: b.type || 'study',
        taskId: b.taskId || `task-llm-${i}`,
        subject: b.subject,
        priority: b.priority || 'medium',
        start: b.start || '09:00',
        end: b.end || '09:50',
        duration: Number(b.duration),
        deadline: b.deadline || '',
        note: b.note || 'AI-scheduled focus block'
      });
    }

    if (totalDuration > budgetMinutes) {
      return { isValid: false, reason: `LLM plan duration (${totalDuration}m) exceeds daily budget (${budgetMinutes}m).` };
    }

    const unscheduledTasks = Array.isArray(plan.unscheduledTasks)
      ? plan.unscheduledTasks.map(u => ({ task: { subject: u.subject }, reason: u.reason }))
      : [];

    return {
      isValid: true,
      parsedPlan: {
        totalDailyBudgetMinutes: budgetMinutes,
        allocatedMinutes: totalDuration,
        conflicts: unscheduledTasks.map(u => ({ task: u.task, reason: u.reason })),
        unscheduledTasks: unscheduledTasks,
        scheduledTimelineBlocks: scheduledBlocks,
        generatedSessions: scheduledBlocks.filter(b => b.type === 'study').map((b, idx) => ({
          id: `session-llm-${idx}`,
          taskId: b.taskId,
          subject: b.subject,
          duration: b.duration,
          priority: b.priority,
          deadline: b.deadline,
          studySplit: Math.min(b.duration, 50),
          breakSplit: b.duration > 50 ? 10 : 5
        }))
      }
    };
  }

  // ==========================================================================
  // DETERMINISTIC SCHEDULING ENGINE (Preserved Fallback)
  // ==========================================================================

  function generateDeterministicStudyPlan() {
    const totalDailyBudgetMinutes = Math.round(availableHours * 60);
    let remainingBudgetMinutes = totalDailyBudgetMinutes;
    let allocatedMinutes = 0;

    // Daily timeline start: 09:00 AM of today
    const now = new Date();
    const scheduleAnchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    let clockCursor = new Date(scheduleAnchor);

    const conflicts = [];
    const unscheduledTasks = [];
    const scheduledTimelineBlocks = [];
    const generatedSessions = [];

    // Filter active (uncompleted) tasks
    const activeTasks = tasks.filter(t => !t.completed);

    if (activeTasks.length === 0) {
      updatePlanUI({
        totalDailyBudgetMinutes,
        allocatedMinutes: 0,
        conflicts: [],
        unscheduledTasks: [],
        scheduledTimelineBlocks: [],
        generatedSessions: []
      });
      return;
    }

    // Step 1: Pre-screen tasks for validity and overdue deadlines
    const validCandidates = [];

    activeTasks.forEach(task => {
      // Validate subject
      if (!task.subject || !task.subject.trim()) {
        const reason = 'Missing subject or course topic.';
        conflicts.push({ task, reason, type: 'invalid' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      // Validate deadline
      if (!task.deadline) {
        const reason = 'Missing deadline date and time.';
        conflicts.push({ task, reason, type: 'missing_deadline' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      const deadlineDate = new Date(task.deadline);
      if (isNaN(deadlineDate.getTime())) {
        const reason = 'Invalid deadline format.';
        conflicts.push({ task, reason, type: 'invalid' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      // Validate duration (ensure strictly positive)
      const duration = parseInt(task.duration, 10);
      if (isNaN(duration) || duration <= 0) {
        const reason = `Invalid duration: ${task.duration} min (must be a positive number).`;
        conflicts.push({ task, reason, type: 'invalid_duration' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      // Check if deadline has already passed (Overdue)
      if (deadlineDate.getTime() < now.getTime()) {
        const reason = `Overdue: Deadline passed on ${formatDisplayDate(task.deadline)}. Cannot schedule overdue task.`;
        conflicts.push({ task, reason, type: 'overdue' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      validCandidates.push({
        ...task,
        duration: duration,
        deadlineTimestamp: deadlineDate.getTime()
      });
    });

    // Step 2: Deterministic Priority & Urgency Sorting
    const priorityWeight = { high: 3, medium: 2, low: 1 };

    validCandidates.sort((a, b) => {
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 2;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 2;

      // Imminent deadline check: due within next 24 hours
      const hoursToA = (a.deadlineTimestamp - now.getTime()) / (1000 * 60 * 60);
      const hoursToB = (b.deadlineTimestamp - now.getTime()) / (1000 * 60 * 60);
      const isUrgentA = hoursToA <= 24;
      const isUrgentB = hoursToB <= 24;

      if (isUrgentA && !isUrgentB) return -1;
      if (!isUrgentA && isUrgentB) return 1;

      // Higher priority first
      if (weightA !== weightB) {
        return weightB - weightA;
      }

      // Nearer deadline first
      if (a.deadlineTimestamp !== b.deadlineTimestamp) {
        return a.deadlineTimestamp - b.deadlineTimestamp;
      }

      // Shorter duration breaks ties
      return a.duration - b.duration;
    });

    // Step 3: Sequential Scheduling, Session Splitting, and Capacity Enforcement
    validCandidates.forEach(task => {
      if (remainingBudgetMinutes <= 0) {
        const reason = `Daily Capacity Reached (${totalDailyBudgetMinutes}m): Requires ${task.duration}m; overflow carried over.`;
        conflicts.push({ task, reason, type: 'insufficient_time' });
        unscheduledTasks.push({ task, reason });
        return;
      }

      // Determine task session splitting
      // Split into realistic focus blocks (<= 60m)
      let taskChunks = [];
      if (task.duration <= 60) {
        taskChunks = [task.duration];
      } else {
        let remDur = task.duration;
        while (remDur > 0) {
          if (remDur <= 60) {
            taskChunks.push(remDur);
            remDur = 0;
          } else {
            const splitSize = remDur >= 100 ? 50 : 45;
            taskChunks.push(splitSize);
            remDur -= splitSize;
          }
        }
      }

      // Schedule chunks for this task
      let taskScheduledAny = false;
      let taskRemainingDuration = task.duration;

      for (let cIdx = 0; cIdx < taskChunks.length; cIdx++) {
        let chunkDuration = taskChunks[cIdx];

        if (remainingBudgetMinutes <= 0) {
          break;
        }

        // Exact capacity check: if chunk exceeds remaining budget, split into remaining budget
        let scheduledChunkDur = chunkDuration;
        if (scheduledChunkDur > remainingBudgetMinutes) {
          if (remainingBudgetMinutes >= 15) {
            scheduledChunkDur = remainingBudgetMinutes;
          } else {
            // Remaining fragment too small for a meaningful session (< 15 min buffer)
            break;
          }
        }

        // Avoid scheduling after deadline
        const blockStartTime = new Date(clockCursor);
        const blockEndTime = new Date(clockCursor.getTime() + scheduledChunkDur * 60000);

        if (blockEndTime.getTime() > task.deadlineTimestamp) {
          const reason = `Deadline Conflict: Session would end at ${formatTimeFromDate(blockEndTime)}, which is past deadline (${formatDisplayDate(task.deadline)}).`;
          conflicts.push({ task, reason, type: 'deadline_exceeded' });
          if (!taskScheduledAny) {
            unscheduledTasks.push({ task, reason });
          }
          break;
        }

        // Schedule Study Block
        const startStr = formatTimeFromDate(blockStartTime);
        const endStr = formatTimeFromDate(blockEndTime);

        const sessionLabel = taskChunks.length > 1
          ? `${task.subject} (Part ${cIdx + 1}/${taskChunks.length})`
          : task.subject;

        scheduledTimelineBlocks.push({
          type: 'study',
          taskId: task.id,
          subject: sessionLabel,
          priority: task.priority,
          start: startStr,
          end: endStr,
          startDate: blockStartTime,
          endDate: blockEndTime,
          duration: scheduledChunkDur,
          deadline: task.deadline,
          note: `Deterministic block targeting ${task.priority} priority objective`
        });

        // Add to generated study sessions list
        const studySplit = Math.min(scheduledChunkDur, 50);
        const breakSplit = scheduledChunkDur > 50 ? 10 : 5;

        generatedSessions.push({
          id: `${task.id}-session-${cIdx}`,
          taskId: task.id,
          subject: sessionLabel,
          duration: scheduledChunkDur,
          priority: task.priority,
          deadline: task.deadline,
          studySplit,
          breakSplit
        });

        // Advance cursor and decrement budget
        clockCursor = new Date(blockEndTime);
        remainingBudgetMinutes -= scheduledChunkDur;
        allocatedMinutes += scheduledChunkDur;
        taskRemainingDuration -= scheduledChunkDur;
        taskScheduledAny = true;

        // Realistic Cognitive Recovery Interval (Break)
        if (remainingBudgetMinutes > 0) {
          const breakDuration = scheduledChunkDur >= 50 ? 10 : 5;
          const breakStartTime = new Date(clockCursor);
          const breakEndTime = new Date(clockCursor.getTime() + breakDuration * 60000);

          scheduledTimelineBlocks.push({
            type: 'break',
            subject: 'Cognitive Recovery Interval',
            start: formatTimeFromDate(breakStartTime),
            end: formatTimeFromDate(breakEndTime),
            startDate: breakStartTime,
            endDate: breakEndTime,
            duration: breakDuration,
            note: 'Rest eyes, hydrate, and prepare for next study focus block'
          });

          clockCursor = new Date(breakEndTime);
        }
      }

      // If task could not be fully scheduled due to available hours
      if (taskRemainingDuration > 0) {
        if (!taskScheduledAny) {
          const reason = `Workload Overflow: Requires ${task.duration}m, but daily study capacity (${totalDailyBudgetMinutes}m) is fully scheduled.`;
          conflicts.push({ task, reason, type: 'insufficient_time' });
          unscheduledTasks.push({ task, reason });
        } else {
          const reason = `Partially Scheduled: ${task.duration - taskRemainingDuration}m scheduled today; remaining ${taskRemainingDuration}m workload carried over.`;
          conflicts.push({ task, reason, type: 'partially_scheduled' });
          unscheduledTasks.push({ task, reason });
        }
      }
    });

    updatePlanUI({
      totalDailyBudgetMinutes,
      allocatedMinutes,
      conflicts,
      unscheduledTasks,
      scheduledTimelineBlocks,
      generatedSessions
    });
  }

  // --- UI Update Renderer for Study Plan ---

  function updatePlanUI(plan) {
    const {
      totalDailyBudgetMinutes,
      allocatedMinutes,
      conflicts,
      unscheduledTasks,
      scheduledTimelineBlocks,
      generatedSessions
    } = plan;

    // 1. Mathematically Accurate Allocation Meter & Capacity Badges
    const percentage = totalDailyBudgetMinutes === 0
      ? 0
      : Math.min(100, Math.round((allocatedMinutes / totalDailyBudgetMinutes) * 100));

    if (allocationFill) allocationFill.style.width = `${percentage}%`;
    if (allocationStatsText) {
      allocationStatsText.textContent = `${allocatedMinutes} min / ${totalDailyBudgetMinutes} min allocated (${percentage}%)`;
    }

    if (allocationCapacityBadge) {
      if (allocatedMinutes >= totalDailyBudgetMinutes && totalDailyBudgetMinutes > 0) {
        if (unscheduledTasks.length > 0) {
          allocationCapacityBadge.textContent = `Daily Budget Reached (${unscheduledTasks.length} Overflow)`;
          allocationCapacityBadge.className = 'capacity-badge reached';
        } else {
          allocationCapacityBadge.textContent = 'Fully Allocated (100%)';
          allocationCapacityBadge.className = 'capacity-badge';
        }
      } else if (unscheduledTasks.length > 0) {
        allocationCapacityBadge.textContent = `Workload Exceeds Capacity (${unscheduledTasks.length} Unscheduled)`;
        allocationCapacityBadge.className = 'capacity-badge reached';
      } else {
        allocationCapacityBadge.textContent = 'Within Budget';
        allocationCapacityBadge.className = 'capacity-badge';
      }
    }

    // 2. Conflict Banner
    if (conflictBanner) {
      if (conflicts.length === 0) {
        conflictBanner.style.display = 'none';
      } else {
        conflictBanner.style.display = 'flex';
        if (conflictBannerTitle) {
          conflictBannerTitle.textContent = `Plan Notices & Constraints (${conflicts.length} Item${conflicts.length > 1 ? 's' : ''})`;
        }
        if (conflictList) {
          conflictList.innerHTML = conflicts.map(c => `
            <div class="conflict-item">
              <span class="conflict-task-name">${escapeHtml(c.task.subject)}:</span>
              <span class="conflict-reason">${escapeHtml(c.reason)}</span>
            </div>
          `).join('');
        }
      }
    }

    // 3. Render Daily Timeline View
    renderTimelineView(scheduledTimelineBlocks, conflicts);

    // 4. Render Day Calendar Grid View
    renderCalendarGridView(scheduledTimelineBlocks);

    // 5. Generated Study Sessions Render
    renderSessionsView(generatedSessions);

    // 6. Unscheduled Tasks Display (Never silently discard unscheduled tasks!)
    renderUnscheduledView(unscheduledTasks);
  }

  function renderTimelineView(scheduledTimelineBlocks, conflicts) {
    if (!scheduleTimeline) return;
    scheduleTimeline.innerHTML = '';

    if (scheduleBlockCount) {
      scheduleBlockCount.textContent = `${scheduledTimelineBlocks.length} Blocks Planned`;
    }

    if (scheduledTimelineBlocks.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.padding = '1.5rem';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.color = '#173744';
      emptyDiv.style.fontSize = '0.875rem';
      emptyDiv.textContent = conflicts && conflicts.length > 0
        ? 'No study sessions could be scheduled into today\'s timeline due to constraints above.'
        : 'All study tasks completed or no active tasks available.';
      scheduleTimeline.appendChild(emptyDiv);
      return;
    }

    scheduledTimelineBlocks.forEach(block => {
      const blockEl = document.createElement('div');
      blockEl.className = 'timeline-block';

      if (block.type === 'break') {
        blockEl.innerHTML = `
          <div class="timeline-time-col">
            <span class="time-start">${block.start}</span>
            <span class="time-end">${block.end}</span>
          </div>
          <div class="timeline-card break-slot">
            <div class="timeline-slot-header">
              <span class="slot-type-label">Recovery Interval</span>
              <span class="slot-duration-pill">${block.duration} min</span>
            </div>
            <div class="slot-title">${escapeHtml(block.subject)}</div>
            <p class="slot-note">${block.note}</p>
          </div>
        `;
      } else {
        blockEl.innerHTML = `
          <div class="timeline-time-col">
            <span class="time-start">${block.start}</span>
            <span class="time-end">${block.end}</span>
          </div>
          <div class="timeline-card">
            <div class="timeline-slot-header">
              <span class="slot-type-label">Deep Study Block</span>
              <span class="slot-duration-pill">${block.duration} min</span>
            </div>
            <div class="slot-title">${escapeHtml(block.subject)}</div>
            <p class="slot-note">${block.note}</p>
            <div class="timeline-card-footer">
              <span class="slot-deadline-badge">Due: ${formatDisplayDate(block.deadline)}</span>
              <button type="button" class="card-complete-btn" data-action="quick-complete" data-task-id="${block.taskId}" title="Mark completed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Mark Done
              </button>
            </div>
          </div>
        `;
      }

      scheduleTimeline.appendChild(blockEl);
    });
  }

  function renderCalendarGridView(scheduledTimelineBlocks) {
    if (!scheduleCalendarGrid) return;
    scheduleCalendarGrid.innerHTML = '';

    const studyBlocks = scheduledTimelineBlocks.filter(b => b.type === 'study');

    if (studyBlocks.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.style.padding = '1.5rem';
      emptyNotice.style.textAlign = 'center';
      emptyNotice.style.color = '#173744';
      emptyNotice.style.fontSize = '0.875rem';
      emptyNotice.textContent = 'No study blocks scheduled in calendar view for today.';
      scheduleCalendarGrid.appendChild(emptyNotice);
      return;
    }

    let startHour = 9;
    let endHour = 17;

    scheduledTimelineBlocks.forEach(b => {
      if (b.endDate) {
        const h = b.endDate.getHours();
        if (h >= endHour) endHour = Math.min(23, h + 1);
      }
    });

    for (let h = startHour; h <= endHour; h++) {
      const slotRow = document.createElement('div');
      slotRow.className = 'calendar-slot-row';

      const hourLabel = document.createElement('div');
      hourLabel.className = 'calendar-hour-label';
      const hhStr = String(h).padStart(2, '0');
      hourLabel.textContent = `${hhStr}:00`;

      const slotContent = document.createElement('div');
      slotContent.className = 'calendar-slot-content';

      const matchingBlocks = scheduledTimelineBlocks.filter(b => {
        if (!b.startDate || !b.endDate) return false;
        const bStartHour = b.startDate.getHours();
        const bEndHour = b.endDate.getHours();
        const bEndMin = b.endDate.getMinutes();
        return (bStartHour === h) || (bStartHour < h && (bEndHour > h || (bEndHour === h && bEndMin > 0)));
      });

      if (matchingBlocks.length === 0) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'calendar-empty-slot';
        emptySlot.textContent = 'Free Time / Flex Interval';
        slotContent.appendChild(emptySlot);
      } else {
        matchingBlocks.forEach(b => {
          if (b.type === 'break') {
            const breakEl = document.createElement('div');
            breakEl.className = 'calendar-break-block';
            breakEl.innerHTML = `
              <span>${b.start} - ${b.end} &bull; ${escapeHtml(b.subject)}</span>
              <span>${b.duration}m Rest</span>
            `;
            slotContent.appendChild(breakEl);
          } else {
            const blockEl = document.createElement('div');
            blockEl.className = 'calendar-session-block';
            blockEl.innerHTML = `
              <div class="cal-block-left">
                <div class="cal-title-row">
                  <span class="cal-title">${b.start} - ${b.end} &bull; ${escapeHtml(b.subject)}</span>
                </div>
                <div class="cal-meta-row">
                  <span class="cal-tag-duration">${b.duration} min focus</span>
                  <span class="cal-tag-deadline">Due: ${formatDisplayDate(b.deadline)}</span>
                  <span class="cal-tag-priority">Priority: ${b.priority}</span>
                </div>
              </div>
              <button type="button" class="card-complete-btn" data-action="quick-complete" data-task-id="${b.taskId}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Done
              </button>
            `;
            slotContent.appendChild(blockEl);
          }
        });
      }

      slotRow.appendChild(hourLabel);
      slotRow.appendChild(slotContent);
      scheduleCalendarGrid.appendChild(slotRow);
    }
  }

  function renderSessionsView(generatedSessions) {
    if (!sessionsContainer) return;
    sessionsContainer.innerHTML = '';

    if (sessionsCounterBadge) {
      sessionsCounterBadge.textContent = `${generatedSessions.length} Sessions Ready`;
    }

    if (generatedSessions.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.padding = '1.5rem';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.color = '#173744';
      emptyDiv.style.fontSize = '0.875rem';
      emptyDiv.textContent = 'No active sessions generated for current plan.';
      sessionsContainer.appendChild(emptyDiv);
      return;
    }

    generatedSessions.forEach((session, index) => {
      const sessionCard = document.createElement('div');
      sessionCard.className = 'session-card';

      sessionCard.innerHTML = `
        <div class="session-card-top">
          <span class="session-order-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Session ${index + 1}
          </span>
          <span class="session-status-badge ${index === 0 ? 'status-ready' : 'status-scheduled'}">
            ${index === 0 ? 'Next Up' : 'Scheduled'}
          </span>
        </div>
        <div class="session-subject-title">${escapeHtml(session.subject)}</div>
        <div class="session-breakdown">
          <span class="breakdown-item">
            <span class="breakdown-dot"></span>
            ${session.studySplit}m Focused Study
          </span>
          <span class="breakdown-item">
            <span class="breakdown-dot"></span>
            ${session.breakSplit}m Break
          </span>
          <span class="breakdown-item">
            <span class="breakdown-dot"></span>
            Due: ${formatDisplayDate(session.deadline)}
          </span>
        </div>
        <div class="session-actions">
          <button type="button" class="card-complete-btn" data-action="quick-complete" data-task-id="${session.taskId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Mark Task Done
          </button>
        </div>
      `;

      sessionsContainer.appendChild(sessionCard);
    });
  }

  function renderUnscheduledView(unscheduledTasks) {
    if (!unscheduledSection) return;

    if (unscheduledTasks.length === 0) {
      unscheduledSection.style.display = 'none';
    } else {
      unscheduledSection.style.display = 'flex';
      if (unscheduledCountTag) {
        unscheduledCountTag.textContent = `${unscheduledTasks.length} Task${unscheduledTasks.length > 1 ? 's' : ''}`;
      }
      if (unscheduledList) {
        unscheduledList.innerHTML = unscheduledTasks.map(u => `
          <div class="unscheduled-card">
            <div class="unscheduled-card-left">
              <span class="unscheduled-task-title">${escapeHtml(u.task.subject || 'Untitled Task')}</span>
              <span class="unscheduled-task-meta">${u.task.duration || 0}m &bull; Priority: ${u.task.priority || 'medium'} &bull; Due: ${formatDisplayDate(u.task.deadline)}</span>
            </div>
            <div class="unscheduled-reason-badge">${escapeHtml(u.reason)}</div>
          </div>
        `).join('');
      }
    }
  }

  // --- Rendering Task Items in List ---

  function renderTasks() {
    taskListContainer.innerHTML = '';
    const nowTime = Date.now();

    const filtered = tasks.filter(t => {
      if (currentFilter === 'active') return !t.completed;
      if (currentFilter === 'completed') return t.completed;
      return true;
    });

    if (filtered.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.className = 'empty-state-notice';
      emptyNotice.style.padding = '1.5rem';
      emptyNotice.style.textAlign = 'center';
      emptyNotice.style.color = '#173744';
      emptyNotice.style.opacity = '0.75';
      emptyNotice.style.fontSize = '0.875rem';
      emptyNotice.textContent = currentFilter === 'all' 
        ? 'No study tasks yet. Use the form above to add your first task.'
        : `No ${currentFilter} tasks found.`;
      taskListContainer.appendChild(emptyNotice);
    } else {
      filtered.forEach(task => {
        const item = document.createElement('div');
        const isCurrentlyEdited = task.id === editingTaskId;
        const isOverdue = !task.completed && task.deadline && new Date(task.deadline).getTime() < nowTime;

        item.className = `task-item ${task.completed ? 'completed' : ''} ${isCurrentlyEdited ? 'is-editing' : ''}`;
        item.dataset.id = task.id;

        const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
        const priorityTagClass = `tag-priority-${task.priority.toLowerCase()}`;

        item.innerHTML = `
          <div class="task-left">
            <button type="button" class="task-checkbox-custom" aria-label="Mark task ${task.completed ? 'incomplete' : 'complete'}" data-action="toggle">
              ${task.completed ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ` : ''}
            </button>
            <div class="task-info">
              <h4 class="task-title" title="${escapeHtml(task.subject)}">${escapeHtml(task.subject)}</h4>
              <div class="task-tags">
                <span class="task-tag tag-duration">${task.duration}m</span>
                <span class="task-tag tag-deadline">Due ${formatDisplayDate(task.deadline)}</span>
                <span class="task-tag ${priorityTagClass}">${priorityLabel}</span>
                ${isOverdue ? '<span class="task-tag tag-overdue">Overdue</span>' : ''}
              </div>
            </div>
          </div>
          <div class="task-actions-group">
            <button type="button" class="task-action-btn task-edit-btn" title="Edit task" aria-label="Edit task ${escapeHtml(task.subject)}" data-action="edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button type="button" class="task-action-btn task-delete-btn" title="Delete task" aria-label="Delete task ${escapeHtml(task.subject)}" data-action="delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        taskListContainer.appendChild(item);
      });
    }

    updateMetrics();
    generateStudyPlan();
  }

  function updateMetrics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressPercentageLabel) progressPercentageLabel.textContent = `${percentage}% Completed`;
    if (tasksCompletedCount) tasksCompletedCount.textContent = `${completed} of ${total} tasks finished`;

    const totalMinutes = tasks.reduce((acc, t) => acc + (parseInt(t.duration, 10) || 0), 0);
    if (totalStudyTime) totalStudyTime.textContent = `Total Est: ${totalMinutes} min`;

    if (countAll) countAll.textContent = total;
    if (countActive) countActive.textContent = active;
    if (countCompleted) countCompleted.textContent = completed;
  }

  // --- Utility Calculations ---
  function formatTimeFromDate(d) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Reset & Edit Mode Handlers ---

  function resetFormState() {
    editingTaskId = null;
    if (editingTaskIdInput) editingTaskIdInput.value = '';
    form.reset();
    clearAllErrors();
    setDefaultDeadline();
    const medRadio = document.getElementById('priority-medium');
    if (medRadio) medRadio.checked = true;

    if (formCardTitle) formCardTitle.textContent = 'Add Study Task';
    if (formCardDesc) formCardDesc.textContent = 'Define task parameters to generate balanced study sessions';
    if (formSubmitText) formSubmitText.textContent = 'Add Study Task';
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    if (resetTaskBtn) resetTaskBtn.style.display = 'inline-flex';
  }

  function startEditingTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    editingTaskId = task.id;
    if (editingTaskIdInput) editingTaskIdInput.value = task.id;

    clearAllErrors();

    subjectInput.value = task.subject;
    deadlineInput.value = task.deadline;
    durationInput.value = task.duration;

    const priorityRadio = document.querySelector(`input[name="priority"][value="${task.priority}"]`);
    if (priorityRadio) priorityRadio.checked = true;

    if (formCardTitle) formCardTitle.textContent = 'Edit Study Task';
    if (formCardDesc) formCardDesc.textContent = 'Modify task parameters and save changes';
    if (formSubmitText) formSubmitText.textContent = 'Update Study Task';
    if (cancelEditBtn) cancelEditBtn.style.display = 'inline-flex';
    if (resetTaskBtn) resetTaskBtn.style.display = 'none';

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    subjectInput.focus();
    renderTasks();
  }

  // --- Quick Task Completion Handler ---
  function markTaskCompleted(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = true;
      saveTasks();
      renderTasks();
    }
  }

  // --- Event Handlers ---

  function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const subject = String(subjectInput.value || '').trim();
    const deadline = String(deadlineInput.value || '').trim();
    const duration = parseInt(durationInput.value, 10);
    const selectedPriorityEl = document.querySelector('input[name="priority"]:checked');
    const priority = selectedPriorityEl ? selectedPriorityEl.value : 'medium';

    if (editingTaskId) {
      const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
      if (taskIndex !== -1) {
        tasks[taskIndex].subject = subject;
        tasks[taskIndex].deadline = deadline;
        tasks[taskIndex].duration = duration;
        tasks[taskIndex].priority = priority;
      }
      resetFormState();
    } else {
      const newTask = {
        id: 'task-' + Date.now(),
        subject,
        deadline,
        duration,
        priority,
        completed: false
      };
      tasks.unshift(newTask);
      resetFormState();
    }

    saveTasks();
    renderTasks();
  }

  function handleTaskAction(e) {
    const toggleBtn = e.target.closest('[data-action="toggle"]');
    const editBtn = e.target.closest('[data-action="edit"]');
    const deleteBtn = e.target.closest('[data-action="delete"]');
    const taskItem = e.target.closest('.task-item');

    if (!taskItem) return;
    const taskId = taskItem.dataset.id;

    if (toggleBtn) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
      }
    } else if (editBtn) {
      startEditingTask(taskId);
    } else if (deleteBtn) {
      if (editingTaskId === taskId) {
        resetFormState();
      }
      tasks = tasks.filter(t => t.id !== taskId);
      saveTasks();
      renderTasks();
    }
  }

  function handleQuickComplete(e) {
    const completeBtn = e.target.closest('[data-action="quick-complete"]');
    if (!completeBtn) return;
    const taskId = completeBtn.dataset.taskId;
    if (taskId) {
      markTaskCompleted(taskId);
    }
  }

  function handleChipClick(e) {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    const minutes = btn.dataset.duration;
    if (minutes) {
      durationInput.value = minutes;
      clearFieldError(durationInput, durationError);
    }
  }

  function handleHoursPresetClick(e) {
    const btn = e.target.closest('.hours-chip-btn');
    if (!btn) return;

    hoursPresetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const h = parseFloat(btn.dataset.hours);
    if (!isNaN(h) && h > 0) {
      availableHours = h;
      if (availableHoursInput) availableHoursInput.value = h;
      saveAvailableHours(availableHours);
      generateStudyPlan();
    }
  }

  function handleHoursInputChange(e) {
    let val = parseFloat(availableHoursInput.value);
    if (isNaN(val)) return;
    if (val < 0.5) val = 0.5;
    if (val > 16) val = 16;
    availableHours = val;

    if (e && e.type === 'change') {
      availableHoursInput.value = val;
    }

    hoursPresetButtons.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.hours) === val);
    });

    saveAvailableHours(availableHours);
    generateStudyPlan();
  }

  function handleViewSwitch(viewName) {
    currentScheduleView = viewName;
    if (viewName === 'timeline') {
      if (viewTimelineBtn) viewTimelineBtn.classList.add('active');
      if (viewCalendarBtn) viewCalendarBtn.classList.remove('active');
      if (scheduleTimeline) scheduleTimeline.style.display = 'flex';
      if (scheduleCalendarGrid) scheduleCalendarGrid.style.display = 'none';
    } else {
      if (viewTimelineBtn) viewTimelineBtn.classList.remove('active');
      if (viewCalendarBtn) viewCalendarBtn.classList.add('active');
      if (scheduleTimeline) scheduleTimeline.style.display = 'none';
      if (scheduleCalendarGrid) scheduleCalendarGrid.style.display = 'flex';
    }
  }

  function handleFilterClick(e) {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;

    filterTabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    currentFilter = btn.dataset.filter || 'all';
    renderTasks();
  }

  function setDefaultDeadline() {
    if (deadlineInput) {
      deadlineInput.value = getRelativeDateTime(1, 17, 0);
    }
  }

  // --- Initialization ---
  function init() {
    // Set Header Date
    if (headerDateText) {
      headerDateText.textContent = formatHeaderDate();
    }

    // Set Initial Available Hours
    if (availableHoursInput) {
      availableHoursInput.value = availableHours;
      availableHoursInput.addEventListener('change', handleHoursInputChange);
      availableHoursInput.addEventListener('input', handleHoursInputChange);
    }

    hoursPresetButtons.forEach(btn => {
      btn.addEventListener('click', handleHoursPresetClick);
      if (parseFloat(btn.dataset.hours) === availableHours) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // View Switcher Handlers
    if (viewTimelineBtn) {
      viewTimelineBtn.addEventListener('click', () => handleViewSwitch('timeline'));
    }
    if (viewCalendarBtn) {
      viewCalendarBtn.addEventListener('click', () => handleViewSwitch('calendar'));
    }

    // Set Default Deadline
    setDefaultDeadline();

    // Generate Study Plan Button Click Handler
    if (generatePlanBtn) {
      generatePlanBtn.addEventListener('click', () => {
        generateStudyPlan();
      });
    }

    // Attach Listeners
    if (form) form.addEventListener('submit', handleFormSubmit);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => {
      resetFormState();
      renderTasks();
    });
    if (resetTaskBtn) resetTaskBtn.addEventListener('click', () => {
      clearAllErrors();
      setDefaultDeadline();
    });

    if (taskListContainer) taskListContainer.addEventListener('click', handleTaskAction);

    // Global listeners for quick-completion buttons across Timeline, Calendar, and Sessions
    if (scheduleTimeline) scheduleTimeline.addEventListener('click', handleQuickComplete);
    if (scheduleCalendarGrid) scheduleCalendarGrid.addEventListener('click', handleQuickComplete);
    if (sessionsContainer) sessionsContainer.addEventListener('click', handleQuickComplete);

    durationChips.forEach(chip => {
      chip.addEventListener('click', handleChipClick);
    });

    filterTabs.forEach(tab => {
      tab.addEventListener('click', handleFilterClick);
    });

    // Real-time error clearing on input
    if (subjectInput) {
      subjectInput.addEventListener('input', () => {
        if (subjectInput.value.trim()) clearFieldError(subjectInput, subjectError);
      });
    }
    if (deadlineInput) {
      deadlineInput.addEventListener('input', () => {
        if (deadlineInput.value) clearFieldError(deadlineInput, deadlineError);
      });
    }
    if (durationInput) {
      durationInput.addEventListener('input', () => {
        const val = Number(durationInput.value);
        if (val > 0) clearFieldError(durationInput, durationError);
      });
    }

    // Proactively verify LLM endpoint readiness on initialization
    checkInitialLLMStatus();

    // Render Initial State
    renderTasks();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
