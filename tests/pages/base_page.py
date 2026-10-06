from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


def by_test_id(name):
    return (By.CSS_SELECTOR, f'[data-test-id="{name}"]')


class BasePage:
    TIMEOUT = 5

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, self.TIMEOUT)

    def visible(self, locator, message=""):
        return self.wait.until(EC.visibility_of_element_located(locator), message)

    def fill(self, locator, text):
        field = self.visible(locator)
        field.clear()
        field.send_keys(text)

    def click(self, locator):
        self.wait.until(EC.element_to_be_clickable(locator)).click()
