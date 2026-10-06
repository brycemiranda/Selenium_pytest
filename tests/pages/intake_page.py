from pages.base_page import BasePage, by_test_id


class IntakePage(BasePage):
    NAME = by_test_id("intake-name")
    DOB = by_test_id("intake-dob")
    ALLERGIES = by_test_id("intake-allergies")
    MEDICATION = by_test_id("intake-medication")
    SAVE = by_test_id("intake-save")
    ERROR = by_test_id("intake-error")

    def wait_until_loaded(self):
        self.visible(self.NAME, "intake form never appeared after login")
        return self

    def add_patient(self, name, dob, allergies, medication):
        self.fill(self.NAME, name)
        self.fill(self.DOB, dob)
        self.fill(self.ALLERGIES, allergies)
        self.fill(self.MEDICATION, medication)
        self.click(self.SAVE)

    def error_text(self):
        return self.visible(self.ERROR, "intake validation error never appeared").text
