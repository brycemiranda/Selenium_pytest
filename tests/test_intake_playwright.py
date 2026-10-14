import pytest
from playwright.sync_api import Page, expect

JANE = {
    "name": "Jane Testpatient",
    "dob": "1990-04-12",
    "allergies": "Penicillin",
    "medication": "Lisinopril",
}


@pytest.fixture(scope="session", autouse=True)
def use_data_test_id(playwright):
    # Playwright's get_by_test_id looks for data-testid by default; this app uses data-test-id.
    playwright.selectors.set_test_id_attribute("data-test-id")


def log_in(page: Page, base_url):
    page.goto(base_url)
    page.get_by_test_id("login-username").fill("demo")
    page.get_by_test_id("login-password").fill("demo")
    page.get_by_test_id("login-submit").click()


def add_patient(page: Page, name, dob, allergies, medication):
    page.get_by_test_id("intake-name").fill(name)
    page.get_by_test_id("intake-dob").fill(dob)
    page.get_by_test_id("intake-allergies").fill(allergies)
    page.get_by_test_id("intake-medication").fill(medication)
    page.get_by_test_id("intake-save").click()


def test_pw_allergies_preserved_after_save(page: Page, base_url):
    log_in(page, base_url)
    add_patient(page, **JANE)
    allergies_cell = page.get_by_test_id("patient-row").last.locator('[data-field="allergies"]')
    expect(allergies_cell).to_have_text("Penicillin")


def test_pw_future_dob_is_rejected(page: Page, base_url):
    log_in(page, base_url)
    add_patient(page, **{**JANE, "dob": "2099-01-01"})
    error = page.get_by_test_id("intake-error")
    expect(error).to_be_visible()
    expect(error).to_contain_text("future")
    expect(page.get_by_test_id("patient-row")).to_have_count(0)
