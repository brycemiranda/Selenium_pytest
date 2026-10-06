from pages.patient_list_page import PatientListPage

JANE = {
    "name": "Jane Testpatient",
    "dob": "1990-04-12",
    "allergies": "Penicillin",
    "medication": "Lisinopril",
}


def test_saved_patient_appears_in_list(driver, intake_page):
    intake_page.add_patient(**JANE)
    patients = PatientListPage(driver)
    patients.wait_for_row_count(1)
    assert patients.last_patient()["name"] == JANE["name"]


def test_allergies_preserved_after_save(driver, intake_page):
    intake_page.add_patient(**JANE)
    patients = PatientListPage(driver)
    patients.wait_for_row_count(1)
    assert patients.last_patient()["allergies"] == "Penicillin"


def test_future_dob_is_rejected(driver, intake_page):
    intake_page.add_patient(**{**JANE, "dob": "2099-01-01"})
    assert "future" in intake_page.error_text().lower()
    assert PatientListPage(driver).row_count() == 0

