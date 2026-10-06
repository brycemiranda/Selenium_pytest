// Larkspur Hollow Clinic: patient intake demo. Fictional clinic, fake data only.

const patients = []; // in memory only; a page reload clears it

function byTestId(id) {
  return document.querySelector(`[data-test-id="${id}"]`);
}

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = byTestId("login-username").value;
  const password = byTestId("login-password").value;

  if (username === "demo" && password === "demo") {
    byTestId("login-error").hidden = true;
    document.getElementById("login-section").hidden = true;
    document.getElementById("intake-section").hidden = false;
    document.getElementById("list-section").hidden = false;
  } else {
    byTestId("login-error").hidden = false;
  }
});
document.getElementById("intake-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const errorBox = byTestId("intake-error");
  const patient = {
    name: byTestId("intake-name").value.trim(),
    dob: byTestId("intake-dob").value.trim(),
    allergies: bugs.has("allergy") ? "" : byTestId("intake-allergies").value.trim(),
    medication: byTestId("intake-medication").value.trim(),
  };

  const problem = validate(patient);
  if (problem) {
    errorBox.textContent = problem;
    errorBox.hidden = false;
    return;
  }

  errorBox.hidden = true;
  patients.push(patient);
  renderPatients();
  event.target.reset();
});

const bugs = new Set(
  (new URLSearchParams(window.location.search).get("bugs") || "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
);

for (const name of ["allergy", "dob"]) {
  const box = byTestId(`bug-${name}`);
  box.checked = bugs.has(name);
  box.addEventListener("change", () => {
    if (box.checked) bugs.add(name);
    else bugs.delete(name);
  });
}

function validate(patient) {
  if (!patient.name) return "Name is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patient.dob)) return "Date of birth must be YYYY-MM-DD.";
  const today = new Date().toISOString().slice(0, 10);
  if (!bugs.has("dob") && patient.dob > today) return "Date of birth cannot be in the future.";
  return null;
}
function renderPatients() {
  const tbody = byTestId("patient-rows");
  tbody.innerHTML = "";
  for (const p of patients) {
    const row = document.createElement("tr");
    row.setAttribute("data-test-id", "patient-row");
    for (const field of ["name", "dob", "allergies", "medication"]) {
      const cell = document.createElement("td");
      cell.setAttribute("data-field", field);
      cell.textContent = p[field];
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
}
