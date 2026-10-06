from pages.base_page import BasePage, by_test_id


class LoginPage(BasePage):
    USERNAME = by_test_id("login-username")
    PASSWORD = by_test_id("login-password")
    SUBMIT = by_test_id("login-submit")
    ERROR = by_test_id("login-error")

    def open(self, base_url):
        self.driver.get(base_url)
        self.visible(self.USERNAME, "login form never appeared")
        return self

    def login(self, username, password):
        self.fill(self.USERNAME, username)
        self.fill(self.PASSWORD, password)
        self.click(self.SUBMIT)

    def error_text(self):
        return self.visible(self.ERROR, "login error message never appeared").text

from pages.login_page import LoginPage
def test_invalid_login_shows_error(driver, base_url):
    page = LoginPage(driver).open(base_url)
    page.login("demo", "wrong-password")
    assert page.error_text() == "Invalid username or password."
