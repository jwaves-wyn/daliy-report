const MODEL_NAME = "gpt-4o-mini";
const REPORT_TITLE_PREFIX = "##";

const elements = {
  reportDate: document.getElementById("report-date"),
  messengerInput: document.getElementById("messenger-input"),
  jiraInput: document.getElementById("jira-input"),
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeyStatus: document.getElementById("api-key-status"),
  saveApiKey: document.getElementById("save-api-key"),
  deleteApiKey: document.getElementById("delete-api-key"),
  loadSample: document.getElementById("load-sample"),
  generateReport: document.getElementById("generate-report"),
  generateAiReport: document.getElementById("generate-ai-report"),
  copyReport: document.getElementById("copy-report"),
  downloadReport: document.getElementById("download-report"),
  resetForm: document.getElementById("reset-form"),
  reportOutput: document.getElementById("report-output"),
  reportStatus: document.getElementById("report-status"),
  reportGeneratedAt: document.getElementById("report-generated-at"),
};

const sampleFiles = {
  messenger: "messenger_chat_sample.txt",
  jira: "jira_task_sample.csv",
};

let currentReport = null;

elements.reportDate.value = getTodayValue();
updateApiKeyStatus();
renderEmptyReport();

elements.saveApiKey.addEventListener("click", () => {
  const apiKey = elements.apiKeyInput.value.trim();

  if (!apiKey) {
    alert("API Key를 입력해 주세요.");
    return;
  }

  localStorage.setItem("jwaves_api_key", apiKey);
  elements.apiKeyInput.value = "";
  updateApiKeyStatus();
});

elements.deleteApiKey.addEventListener("click", () => {
  localStorage.removeItem("jwaves_api_key");
  elements.apiKeyInput.value = "";
  updateApiKeyStatus();
});

elements.loadSample.addEventListener("click", async () => {
  try {
    const [messengerText, jiraText] = await Promise.all([
      fetch(sampleFiles.messenger).then((response) => response.text()),
      fetch(sampleFiles.jira).then((response) => response.text()),
    ]);

    elements.messengerInput.value = messengerText.trim();
    elements.jiraInput.value = jiraText.trim();
    elements.reportDate.value = getTodayValue();
    renderEmptyReport();
    setReportStatus("샘플 데이터를 불러왔습니다. 이제 보고서를 생성해 보세요.");
  } catch (error) {
    console.error(error);
    alert("샘플 데이터를 불러오지 못했습니다. 파일이 같은 폴더에 있는지 확인해 주세요.");
  }
});

elements.generateReport.addEventListener("click", () => {
  const reportDate = elements.reportDate.value || getTodayValue();
  const messengerText = elements.messengerInput.value.trim();
  const jiraText = elements.jiraInput.value.trim();
  const report = buildReportModel({ reportDate, messengerText, jiraText, mode: "local" });
  renderReport(report);
});

elements.generateAiReport.addEventListener("click", async () => {
  const storedApiKey = localStorage.getItem("jwaves_api_key");

  if (!storedApiKey) {
    renderEmptyReport();
    setReportStatus("API Key가 설정되지 않았습니다. 먼저 API Key를 입력해 주세요.");
    return;
  }

  const reportDate = elements.reportDate.value || getTodayValue();
  const messengerText = elements.messengerInput.value.trim();
  const jiraText = elements.jiraInput.value.trim();
  const reportContext = buildReportModel({ reportDate, messengerText, jiraText, mode: "ai-preview" });

  renderEmptyReport();
  setReportStatus("AI 보고서를 생성 중입니다...");

  try {
    const reportText = await generateAiReportText({
      apiKey: storedApiKey,
      reportDate,
      reportContext,
      messengerText,
      jiraText,
    });
    const report = buildReportModel({
      reportDate,
      messengerText,
      jiraText,
      mode: "ai",
      bodyOverride: reportText,
    });
    renderReport(report);
  } catch (error) {
    console.error(error);
    renderEmptyReport();
    setReportStatus("AI 보고서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요. 계속 실패하면 API Key와 네트워크 상태를 확인해 주세요.");
  }
});

elements.copyReport.addEventListener("click", async () => {
  if (!currentReport) {
    alert("먼저 보고서를 생성해 주세요.");
    return;
  }

  const text = buildClipboardText(currentReport);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopyText(text);
    }
    alert("보고서가 복사되었습니다.");
  } catch (error) {
    console.error(error);
    try {
      fallbackCopyText(text);
      alert("보고서가 복사되었습니다.");
    } catch (fallbackError) {
      console.error(fallbackError);
      alert("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }
});

elements.downloadReport.addEventListener("click", () => {
  if (!currentReport) {
    alert("먼저 보고서를 생성해 주세요.");
    return;
  }

  const blob = new Blob([buildDownloadText(currentReport)], { type: "text/plain;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = buildDownloadFileName(currentReport.reportDate);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
  setReportStatus("TXT 파일로 다운로드했습니다.");
});

elements.resetForm.addEventListener("click", () => {
  elements.reportDate.value = getTodayValue();
  elements.messengerInput.value = "";
  elements.jiraInput.value = "";
  currentReport = null;
  renderEmptyReport();
});

function updateApiKeyStatus() {
  const storedApiKey = localStorage.getItem("jwaves_api_key");
  elements.apiKeyStatus.textContent = storedApiKey ? "API Key 설정됨" : "API Key 미설정";
}

function setReportStatus(message) {
  elements.reportStatus.textContent = `상태: ${message}`;
}

function renderEmptyReport() {
  currentReport = null;
  elements.reportOutput.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "report-placeholder";
  placeholder.textContent = "보고서를 생성하면 결과가 여기에 표시됩니다.";
  elements.reportOutput.appendChild(placeholder);
  elements.reportStatus.textContent = "상태: 대기 중";
  elements.reportGeneratedAt.textContent = "보고서 생성 시각: -";
}

function buildReportModel({ reportDate, messengerText, jiraText, mode, bodyOverride = "" }) {
  const parsedTasks = parseJiraCsv(jiraText);
  const messengerSummary = summarizeMessenger(messengerText);
  const taskSummary = summarizeTasks(parsedTasks, reportDate);
  const summaryRows = buildSummaryRows({ reportDate, parsedTasks, taskSummary });
  const title = buildReportTitle(reportDate);
  const generatedAt = formatDateTimeForDisplay(new Date());
  const bodyText = bodyOverride
    ? normalizeBodyText(bodyOverride, title)
    : buildLocalReportBody({
        reportDate,
        parsedTasks,
        messengerSummary,
        taskSummary,
      });

  return {
    mode,
    reportDate,
    title,
    generatedAt,
    parsedTasks,
    messengerSummary,
    taskSummary,
    summaryRows,
    bodyText,
  };
}

function normalizeBodyText(bodyText, title) {
  const text = String(bodyText || "").trim();
  if (!text) {
    return "";
  }

  const strippedFence = text
    .replace(/^```[a-z-]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const lines = strippedFence.split(/\r?\n/);
  const firstLine = lines[0].trim();
  if (firstLine === title || /^##\d{4}-\d{2}-\d{2}\s+NS\s+기술부\s+보고서$/.test(firstLine)) {
    const remaining = lines.slice(1).join("\n").trim();
    return remaining.replace(/^작성일:\s*.+\n+/, "").trim();
  }

  return strippedFence.replace(/^작성일:\s*.+\n+/, "").trim();
}

function renderReport(report) {
  currentReport = report;
  elements.reportOutput.innerHTML = "";

  const titleEl = document.createElement("h2");
  titleEl.className = "report-title";
  titleEl.textContent = report.title;
  elements.reportOutput.appendChild(titleEl);

  const summarySection = document.createElement("section");
  summarySection.className = "report-section";

  const summaryHeading = document.createElement("h3");
  summaryHeading.className = "report-section__title";
  summaryHeading.textContent = "업무 현황 요약표";
  summarySection.appendChild(summaryHeading);

  const tableScroll = document.createElement("div");
  tableScroll.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["구분", "주요 내용", "담당자", "상태", "우선순위", "다음 조치"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  report.summaryRows.forEach((row) => {
    const tr = document.createElement("tr");
    if (row.priority === "High") {
      tr.classList.add("is-high");
    }

    [row.group, row.mainContent, row.owner, row.status, row.priority, row.nextAction].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableScroll.appendChild(table);
  summarySection.appendChild(tableScroll);
  elements.reportOutput.appendChild(summarySection);

  const bodySection = document.createElement("section");
  bodySection.className = "report-section";
  const bodyHeading = document.createElement("h3");
  bodyHeading.className = "report-section__title";
  bodyHeading.textContent = "일일 업무보고서 본문";
  bodySection.appendChild(bodyHeading);

  const bodyPre = document.createElement("pre");
  bodyPre.className = "report-body";
  bodyPre.textContent = report.bodyText;
  bodySection.appendChild(bodyPre);
  elements.reportOutput.appendChild(bodySection);

  elements.reportGeneratedAt.textContent = `보고서 생성 시각: ${report.generatedAt}`;
  elements.reportStatus.textContent = report.mode === "ai"
    ? "상태: AI 보고서 생성 완료"
    : "상태: 로컬 샘플 보고서 생성 완료";
}

function buildReportTitle(reportDate) {
  return `${REPORT_TITLE_PREFIX}${reportDate} NS 기술부 보고서`;
}

function formatDateTimeForDisplay(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hours = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minutes = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildSummaryRows({ reportDate, parsedTasks, taskSummary }) {
  const completedTasks = parsedTasks.filter((task) => task.status.includes("완료"));
  const inProgressTasks = parsedTasks.filter((task) => task.status.includes("진행"));
  const issueTasks = parsedTasks.filter((task) => {
    const text = `${task.status} ${task.issue_summary} ${task.title}`;
    return task.status.includes("대기") || task.status.includes("모니터링") || /오탐|경고|실패|오류|차단|미적용|점검|확인 필요/.test(text);
  });
  const nextDayTasks = parsedTasks.filter((task) => {
    const dueSoon = getDeadlineStatus(task.due_date, reportDate) === "due-soon" && task.due_date === addDays(reportDate, 1);
    const nextActionCue = /내일|확인|재확인|점검|회의|미팅/.test(task.next_action || "");
    return dueSoon || nextActionCue;
  });
  const supportTasks = dedupeTasks([
    ...taskSummary.highPriorityTasks.filter((task) => !task.status.includes("완료")),
    ...issueTasks.filter((task) => !task.status.includes("완료")),
  ]);

  return [
    createSummaryRow("완료 업무", completedTasks, "완료"),
    createSummaryRow("진행 중 업무", inProgressTasks, "진행 중"),
    createSummaryRow("지연/이슈 업무", issueTasks, issueTasks.some((task) => task.status.includes("모니터링")) ? "모니터링" : "대기"),
    createSummaryRow("내일 예정 업무", nextDayTasks, "예정"),
    createSummaryRow("지원 필요 업무", supportTasks, "추가 확인 필요"),
  ];
}

function createSummaryRow(group, tasks, fallbackStatus) {
  const uniqueTasks = dedupeTasks(tasks);
  const mainContent = uniqueTasks.length > 0
    ? summarizeTaskTitles(uniqueTasks, 2)
    : "추가 확인 필요";
  const owner = uniqueTasks.length > 0 ? summarizeTaskOwners(uniqueTasks, 2) : "추가 확인 필요";
  const priority = normalizePriority(uniqueTasks);
  const nextAction = uniqueTasks.length > 0 ? summarizeTaskNextActions(uniqueTasks, 2) : "추가 확인 필요";
  const status = normalizeStatus(uniqueTasks, fallbackStatus);

  return {
    group,
    mainContent,
    owner,
    status,
    priority,
    nextAction,
  };
}

function normalizeStatus(tasks, fallbackStatus) {
  if (!tasks || tasks.length === 0) {
    return "추가 확인 필요";
  }

  const statuses = tasks.map((task) => String(task.status || "").trim());
  if (statuses.some((status) => status.includes("완료"))) return "완료";
  if (statuses.some((status) => status.includes("진행"))) return "진행 중";
  if (statuses.some((status) => status.includes("모니터링"))) return "모니터링";
  if (statuses.some((status) => status.includes("대기"))) return "대기";
  if (statuses.some((status) => status.includes("예정"))) return "예정";
  return fallbackStatus || "추가 확인 필요";
}

function normalizePriority(tasks) {
  if (!tasks || tasks.length === 0) {
    return "추가 확인 필요";
  }

  const priorities = tasks.map((task) => String(task.priority || "").trim());
  if (priorities.some((priority) => priority === "High")) return "High";
  if (priorities.some((priority) => priority === "Medium")) return "Medium";
  if (priorities.some((priority) => priority === "Low")) return "Low";
  return "추가 확인 필요";
}

function summarizeTaskTitles(tasks, limit = 2) {
  return sanitizeReportText(
    dedupeTasks(tasks)
      .slice(0, limit)
      .map((task) => task.title || "추가 확인 필요")
      .join(", ")
  ) || "추가 확인 필요";
}

function summarizeTaskOwners(tasks, limit = 2) {
  const owners = [];
  tasks.forEach((task) => {
    const owner = sanitizeReportText(task.owner || "");
    if (owner && !owners.includes(owner)) {
      owners.push(owner);
    }
  });
  return owners.slice(0, limit).join(", ") || "추가 확인 필요";
}

function summarizeTaskNextActions(tasks, limit = 2) {
  const actions = [];
  tasks.forEach((task) => {
    const action = sanitizeReportText(task.next_action || task.issue_summary || "");
    if (action && !actions.includes(action)) {
      actions.push(action);
    }
  });
  return actions.slice(0, limit).join(", ") || "추가 확인 필요";
}

function buildLocalReportBody({ reportDate, parsedTasks, messengerSummary, taskSummary }) {
  const completedTasks = parsedTasks.filter((task) => task.status.includes("완료"));
  const inProgressTasks = parsedTasks.filter((task) => task.status.includes("진행"));
  const issueTasks = parsedTasks.filter((task) => {
    const text = `${task.status} ${task.issue_summary} ${task.title}`;
    return task.status.includes("대기") || task.status.includes("모니터링") || /오탐|경고|실패|오류|차단|미적용|점검|확인 필요/.test(text);
  });
  const nextDayTasks = parsedTasks.filter((task) => {
    const dueSoon = getDeadlineStatus(task.due_date, reportDate) === "due-soon" && task.due_date === addDays(reportDate, 1);
    const nextActionCue = /내일|확인|재확인|점검|회의|미팅/.test(task.next_action || "");
    return dueSoon || nextActionCue;
  });
  const supportTasks = dedupeTasks([
    ...taskSummary.highPriorityTasks.filter((task) => !task.status.includes("완료")),
    ...issueTasks.filter((task) => !task.status.includes("완료")),
  ]);

  const lines = [];
  lines.push("##일일 업무 요약");
  lines.push(`- 작성일 기준 ${taskSummary.total}건의 업무를 확인했습니다.`);
  lines.push(`- 완료 ${taskSummary.completed}건, 진행 중 ${taskSummary.inProgress}건, 대기 또는 이슈 ${taskSummary.waiting}건, 예정 ${taskSummary.planned}건입니다.`);
  lines.push(`- 평균 진행률은 ${taskSummary.averageProgress}%이며, High 우선순위 업무는 ${taskSummary.highPriorityTasks.length}건입니다.`);
  lines.push(`- 메신저 핵심 내용: ${sanitizeReportText(messengerSummary.slice(0, 4).join(", ")) || "추가 확인 필요"}`);
  lines.push("");
  lines.push("##주요 완료 업무");
  appendReportTaskLines(lines, completedTasks, 5, "완료된 업무가 없습니다.");
  lines.push("");
  lines.push("##진행 중 업무");
  appendReportTaskLines(lines, inProgressTasks, 5, "진행 중 업무가 없습니다.");
  lines.push("");
  lines.push("##지연/이슈 사항");
  appendReportTaskLines(lines, issueTasks, 6, "확인된 지연 또는 이슈 업무가 없습니다.");
  lines.push("");
  lines.push("##내일 예정 업무");
  appendReportTaskLines(lines, nextDayTasks, 6, "내일 확인할 업무가 없습니다.");
  lines.push("");
  lines.push("##지원 필요 사항");
  appendReportTaskLines(lines, supportTasks, 5, "추가 지원이 필요한 업무가 없습니다.");
  lines.push("");
  lines.push("##내부 공유 메모");
  lines.push(`- 메신저 분석 기준: ${sanitizeReportText(messengerSummary.slice(1, 4).join(", ")) || "특이사항 없음"}`);
  lines.push("- 고객사 집중 구간: 마스킹 필요 고객사 중심");
  lines.push(`- 시스템 집중 구간: ${summarizeTopEntries(taskSummary.bySystem) || "없음"}`);
  lines.push("- 고객명, 계정, IP, 내부 URL, API Key가 포함된 세부값은 마스킹 필요로 표기합니다.");
  lines.push("- 입력 데이터에 없는 내용은 추가 확인 필요로 정리합니다.");

  return lines.join("\n");
}

function appendReportTaskLines(lines, tasks, limit, emptyMessage) {
  const uniqueTasks = dedupeTasks(tasks);
  if (uniqueTasks.length === 0) {
    lines.push(`- ${emptyMessage}`);
    return;
  }

  uniqueTasks.slice(0, limit).forEach((task) => {
    lines.push(`- ${formatTaskLine(task, true)}`);
  });
}

function buildClipboardText(report) {
  return [
    report.title,
    "",
    "[업무 현황 요약표]",
    buildSummaryTableText(report.summaryRows),
    "",
    report.bodyText,
    "",
    `보고서 생성 시각: ${report.generatedAt}`,
  ].join("\n");
}

function buildDownloadText(report) {
  return buildClipboardText(report);
}

function buildDownloadFileName(reportDate) {
  return `nstech_daily_report_${reportDate}.txt`;
}

function buildSummaryTableText(rows) {
  const headers = ["구분", "주요 내용", "담당자", "상태", "우선순위", "다음 조치"];
  const data = rows.map((row) => [
    row.group,
    row.mainContent,
    row.owner,
    row.status,
    row.priority,
    row.nextAction,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...data.map((row) => String(row[index] || "").length)
    )
  );

  const formatRow = (cells) =>
    cells
      .map((cell, index) => String(cell || "").padEnd(widths[index], " "))
      .join(" | ");

  const separator = widths.map((width) => "-".repeat(width)).join("-|-");

  return [
    formatRow(headers),
    separator,
    ...data.map((row) => formatRow(row)),
  ].join("\n");
}

function sanitizeReportText(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    return "";
  }

  return source
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "마스킹 필요")
    .replace(/\bhttps?:\/\/[^\s)]+/gi, "마스킹 필요")
    .replace(/\bsk-[A-Za-z0-9-_]+\b/g, "마스킹 필요")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "마스킹 필요");
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function fallbackCopyText(text) {
  const tempInput = document.createElement("textarea");
  tempInput.value = text;
  tempInput.setAttribute("readonly", "");
  tempInput.style.position = "fixed";
  tempInput.style.opacity = "0";
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);
}

function formatKoreanDate(dateValue) {
  if (!dateValue) {
    return "미입력";
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function parseJiraCsv(csvText) {
  if (!csvText) {
    return [];
  }

  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];

  return rows.slice(1).map((row) =>
    headers.reduce((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function summarizeMessenger(text) {
  if (!text) {
    return ["메신저 대화 내용이 입력되지 않았습니다."];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && /^\d{2}:\d{2}\s/.test(line));

  const topics = [
    { label: "NAC 인증 실패", keywords: ["NAC", "인증", "정책 그룹"] },
    { label: "Agent Offline", keywords: ["Agent Offline", "Agent", "방화벽"] },
    { label: "EDR 탐지", keywords: ["EDR", "탐지", "오탐", "ML"] },
    { label: "SSL 인증서", keywords: ["SSL", "인증서", "만료"] },
    { label: "정책 반영", keywords: ["정책", "적용", "변경정책"] },
  ];

  const matchedTopics = topics
    .map((topic) => {
      const score = topic.keywords.reduce(
        (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
        0
      );
      return { ...topic, score };
    })
    .filter((topic) => topic.score > 0)
    .sort((a, b) => b.score - a.score);

  const result = [`대화 항목 ${lines.length}건을 확인했습니다.`];

  if (matchedTopics.length === 0) {
    result.push("특별한 키워드가 감지되지 않았습니다.");
  } else {
    matchedTopics.slice(0, 5).forEach((topic) => {
      result.push(`${topic.label} 관련 내용이 확인되었습니다.`);
    });
  }

  return result;
}

function summarizeTasks(tasks, referenceDate = getTodayValue()) {
  if (tasks.length === 0) {
    return {
      total: 0,
      completed: 0,
      inProgress: 0,
      waiting: 0,
      planned: 0,
      averageProgress: 0,
      byPriority: {},
      byTaskType: {},
      byCustomer: {},
      bySystem: {},
      highPriorityTasks: [],
      dueTomorrowTasks: [],
      dueSoonTasks: [],
      overdueTasks: [],
      topTasks: [],
    };
  }

  const completed = tasks.filter((task) => task.status.includes("완료")).length;
  const inProgress = tasks.filter((task) => task.status.includes("진행")).length;
  const waiting = tasks.filter((task) => task.status.includes("대기") || task.status.includes("모니터링")).length;
  const planned = tasks.filter((task) => task.status.includes("예정")).length;
  const averageProgress = Math.round(
    tasks.reduce((sum, task) => sum + parseProgress(task.progress), 0) / tasks.length
  );

  const byPriority = tasks.reduce(
    (summary, task) => {
      const key = task.priority || "기타";
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    },
    {}
  );

  const byTaskType = groupByCount(tasks, "task_type");
  const byCustomer = groupByCount(tasks, "customer");
  const bySystem = groupByCount(tasks, "related_system");
  const highPriorityTasks = tasks.filter((task) => task.priority === "High");
  const dueTomorrowTasks = tasks.filter((task) => {
    const status = getDeadlineStatus(task.due_date, referenceDate);
    return status === "due-soon" && task.due_date === addDays(referenceDate, 1);
  });
  const dueSoonTasks = [];
  const overdueTasks = [];
  tasks.forEach((task) => {
    const status = getDeadlineStatus(task.due_date, referenceDate);
    if (status === "due-soon") {
      dueSoonTasks.push(task);
    } else if (status === "overdue") {
      overdueTasks.push(task);
    }
  });

  const topTasks = [...tasks]
    .sort((left, right) => {
      const priorityScore = (value) => {
        if (value === "High") return 3;
        if (value === "Medium") return 2;
        if (value === "Low") return 1;
        return 0;
      };
      return priorityScore(right.priority) - priorityScore(left.priority);
    })
    .slice(0, 5);

  return {
    total: tasks.length,
    completed,
    inProgress,
    waiting,
    planned,
    averageProgress,
    byPriority,
    byTaskType,
    byCustomer,
    bySystem,
    highPriorityTasks,
    dueTomorrowTasks,
    dueSoonTasks,
    overdueTasks,
    topTasks,
  };
}

function buildLocalSampleReport({ reportDate, messengerText, messengerSummary, taskSummary, parsedTasks }) {
  const lines = [];
  const completedTasks = parsedTasks.filter((task) => task.status.includes("완료"));
  const inProgressTasks = parsedTasks.filter((task) => task.status.includes("진행"));
  const issueTasks = parsedTasks.filter(
    (task) =>
      task.status.includes("대기") ||
      task.status.includes("모니터링") ||
      /오탐|경고|실패|오류|차단|미적용|점검|확인 필요/.test(`${task.issue_summary} ${task.title}`)
  );
  const nextDayTasks = [
    ...taskSummary.dueTomorrowTasks,
    ...parsedTasks.filter((task) => /내일|확인|재확인|점검|회의|미팅/.test(task.next_action)),
  ];
  const supportNeeds = [
    ...taskSummary.highPriorityTasks.filter((task) => !task.status.includes("완료")),
    ...issueTasks.filter((task) => !task.status.includes("완료")),
  ];
  const uniqueSupportNeeds = dedupeTasks(supportNeeds);

  lines.push("[일일 업무 요약]");
  lines.push(`- 작성일 기준 ${taskSummary.total}건의 업무를 확인했습니다.`);
  lines.push(
    `- 완료 ${taskSummary.completed}건, 진행 중 ${taskSummary.inProgress}건, 대기 또는 이슈 ${taskSummary.waiting}건, 예정 ${taskSummary.planned}건입니다.`
  );
  lines.push(`- 평균 진행률은 ${taskSummary.averageProgress}%이며, High 우선순위 업무는 ${taskSummary.highPriorityTasks.length}건입니다.`);
  lines.push(`- 메신저 핵심 내용: ${messengerSummary.slice(0, 4).join(", ")}`);
  lines.push("");
  lines.push("[주요 완료 업무]");
  appendTaskList(lines, completedTasks, 5, "완료된 업무가 없습니다.");
  lines.push("");
  lines.push("[진행 중 업무]");
  appendTaskList(lines, inProgressTasks, 5, "진행 중 업무가 없습니다.");
  lines.push("");
  lines.push("[지연/이슈 사항]");
  if (issueTasks.length === 0) {
    lines.push("- 확인된 지연 또는 이슈 업무가 없습니다.");
  } else {
    issueTasks.slice(0, 6).forEach((task) => {
      lines.push(formatTaskLine(task, true));
    });
  }
  lines.push("");
  lines.push("[내일 예정 업무]");
  if (nextDayTasks.length === 0) {
    lines.push("- 내일 확인할 업무가 없습니다.");
  } else {
    dedupeTasks(nextDayTasks).slice(0, 6).forEach((task) => {
      lines.push(formatTaskLine(task, true));
    });
  }
  lines.push("");
  lines.push("[지원 필요 사항]");
  if (uniqueSupportNeeds.length === 0) {
    lines.push("- 추가 지원이 필요한 업무가 없습니다.");
  } else {
    uniqueSupportNeeds.slice(0, 5).forEach((task) => {
      lines.push(`- ${task.ticket_id} | ${task.next_action || task.issue_summary || task.title}`);
    });
  }
  lines.push("");
  lines.push("[내부 공유 메모]");
  lines.push(`- 메신저 분석 기준: ${messengerSummary.slice(1, 4).join(", ") || "특이사항 없음"}`);
  lines.push("- 고객사 집중 구간: 마스킹 필요 고객사 중심");
  lines.push(`- 시스템 집중 구간: ${summarizeTopEntries(taskSummary.bySystem) || "없음"}`);
  lines.push("- 이 보고서는 OpenAI API를 호출하지 않는 로컬 샘플 생성 결과입니다.");
  lines.push("- API Key 없이 실행 가능하며, 샘플 데이터와 로컬 분석만 사용합니다.");

  return lines.join("\n");
}

async function generateAiReportText({ apiKey, reportDate, reportContext, messengerText, jiraText }) {
  const prompt = buildAiPrompt({
    reportDate,
    reportContext,
    messengerSummary: summarizeMessenger(messengerText),
    parsedTasks: parseJiraCsv(jiraText),
    messengerText,
    jiraText,
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      input: prompt,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API 요청에 실패했습니다.");
  }

  const data = await response.json();
  return extractResponseText(data) || "AI 보고서를 생성했지만 응답 내용을 확인하지 못했습니다.";
}

function buildAiPrompt({ reportDate, reportContext, messengerSummary, parsedTasks, messengerText, jiraText }) {
  const topTasks = parsedTasks.slice(0, 6).map((task) => [
    `티켓: ${sanitizeReportText(task.ticket_id)}`,
    `유형: ${sanitizeReportText(task.task_type)}`,
    `제목: ${sanitizeReportText(task.title)}`,
    `상태: ${sanitizeReportText(task.status)}`,
    `우선순위: ${sanitizeReportText(task.priority)}`,
    `진행률: ${sanitizeReportText(task.progress)}`,
    `고객사: 마스킹 필요`,
    `시스템: ${sanitizeReportText(task.related_system)}`,
    `이슈: ${sanitizeReportText(task.issue_summary)}`,
    `다음 조치: ${sanitizeReportText(task.next_action)}`,
  ].join(" / ")).join("\n");

  return [
    "당신은 Genians 기술지원팀의 일일 업무보고서 작성 보조자입니다.",
    "아래 정보를 바탕으로 반드시 한국어로, 팀장에게 공유할 수 있는 업무보고서 톤으로 작성하세요.",
    "화면 상단에 보고서 제목은 별도로 표시되므로, 본문에서는 아래 섹션만 출력하세요.",
    "각 소제목은 반드시 '##'로 시작하세요.",
    "##일일 업무 요약",
    "##주요 완료 업무",
    "##진행 중 업무",
    "##지연/이슈 사항",
    "##내일 예정 업무",
    "##지원 필요 사항",
    "##내부 공유 메모",
    "",
    `작성일: ${formatKoreanDate(reportDate)}`,
    `요약표 초안:\n${buildSummaryTableText(reportContext.summaryRows)}`,
    `메신저 요약: ${messengerSummary.map((item) => sanitizeReportText(item)).join(" | ")}`,
    `업무 현황: 전체 ${reportContext.taskSummary.total}건, 완료 ${reportContext.taskSummary.completed}건, 진행 중 ${reportContext.taskSummary.inProgress}건, 대기/이슈 ${reportContext.taskSummary.waiting}건, 예정 ${reportContext.taskSummary.planned}건, 평균 진행률 ${reportContext.taskSummary.averageProgress}%`,
    `메신저 원문: ${sanitizeReportText(messengerText.slice(0, 2000))}`,
    `JIRA 원문: ${sanitizeReportText(jiraText.slice(0, 3000))}`,
    `주요 업무 예시:\n${topTasks}`,
    "입력 데이터에 없는 내용은 추측하지 말고 반드시 '추가 확인 필요'라고 표시하세요.",
    "고객명, 계정, IP, 내부 URL, API Key 같은 민감정보는 그대로 노출하지 말고 마스킹 필요로 표시하세요.",
    "완료 업무, 진행 중 업무, 지연/이슈 사항, 내일 예정 업무, 지원 필요 사항을 모두 반영하세요.",
    "보고서 본문은 간결하지만 실무적으로 읽히는 톤으로 작성하세요.",
    "출력은 코드 블록 없이 순수 텍스트로만 작성하세요.",
  ].join("\n");
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputItems = Array.isArray(data?.output) ? data.output : [];
  for (const item of outputItems) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (typeof content?.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function groupByCount(tasks, field) {
  return tasks.reduce((summary, task) => {
    const key = task[field] || "기타";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

function parseProgress(progress) {
  const numericValue = Number(String(progress).replace(/[^0-9.]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    if (seen.has(task.ticket_id)) {
      return false;
    }
    seen.add(task.ticket_id);
    return true;
  });
}

function appendTaskList(lines, tasks, limit, emptyMessage) {
  if (tasks.length === 0) {
    lines.push(`- ${emptyMessage}`);
    return;
  }

  tasks.slice(0, limit).forEach((task) => {
    lines.push(formatTaskLine(task, true));
  });
}

function formatTaskLine(task, includeMeta = false) {
  const base = `${sanitizeReportText(task.ticket_id)} | ${sanitizeReportText(task.title)}`;
  if (!includeMeta) {
    return `- ${base}`;
  }

  const parts = [
    task.owner ? `담당 ${sanitizeReportText(task.owner)}` : "",
    task.status ? `상태 ${sanitizeReportText(task.status)}` : "",
    task.priority ? `우선순위 ${sanitizeReportText(task.priority)}` : "",
    task.due_date ? `마감 ${sanitizeReportText(task.due_date)}` : "",
    task.next_action ? `다음 조치 ${sanitizeReportText(task.next_action)}` : "",
  ].filter(Boolean);

  return `- ${base}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}

function summarizeTopEntries(map) {
  const entries = Object.entries(map || {}).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return "";
  }

  return entries
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count}건`)
    .join(", ");
}

function getDeadlineStatus(dueDate, referenceDate) {
  if (!dueDate) {
    return "none";
  }

  const target = new Date(`${dueDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  const diffInDays = Math.round((target.getTime() - reference.getTime()) / 86400000);

  if (diffInDays < 0) {
    return "overdue";
  }

  if (diffInDays <= 2) {
    return "due-soon";
  }

  return "later";
}
