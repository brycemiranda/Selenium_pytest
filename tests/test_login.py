from pages.intake_page import IntakePage
from pages.login_page import LoginPage


def test_valid_login(driver, base_url):
    LoginPage(driver).open(base_url).login("demo", "demo")
    IntakePage(driver).wait_until_loaded()


def test_invalid_login_shows_error(driver, base_url):
    page = LoginPage(driver).open(base_url)
    page.login("demo", "wrong-password")
    assert page.error_text() == "Invalid username or password."
