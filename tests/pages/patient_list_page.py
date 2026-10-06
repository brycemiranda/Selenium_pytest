from selenium.webdriver.common.by import By

from pages.base_page import BasePage, by_test_id


class PatientListPage(BasePage):
    ROWS = by_test_id("patient-row")

    def row_count(self):
        return len(self.driver.find_elements(*self.ROWS))

    def wait_for_row_count(self, count):
        self.wait.until(
            lambda d: len(d.find_elements(*self.ROWS)) == count,
            f"expected {count} patient row(s) in the list",
        )

    def last_patient(self):
        row = self.driver.find_elements(*self.ROWS)[-1]
        cells = row.find_elements(By.CSS_SELECTOR, "td[data-field]")
        return {cell.get_attribute("data-field"): cell.text for cell in cells}
