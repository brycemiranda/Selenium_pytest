import os

import pytest
from selenium import webdriver
from pages.intake_page import IntakePage
from pages.login_page import LoginPage

def pytest_addoption(parser):
    parser.addoption("--headed", action="store_true", help="Show the browser (needs a desktop).")
    parser.addoption("--bugs", default="", help="Bugs to inject into the app, e.g. allergy,dob")

@pytest.fixture
def base_url(request):
    url = os.environ.get("BASE_URL", "http://localhost:8001").rstrip("/")
    bugs = request.config.getoption("--bugs")
    return f"{url}/?bugs={bugs}" if bugs else url

@pytest.fixture
def driver(request):
    options = webdriver.ChromeOptions()
    if not request.config.getoption("--headed"):
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1280,900")
    chrome_bin = os.environ.get("CHROME_BIN")
    if chrome_bin:
        options.binary_location = chrome_bin
    drv = webdriver.Chrome(options=options)
    yield drv
    drv.quit()
@pytest.fixture
def intake_page(driver, base_url):
    LoginPage(driver).open(base_url).login("demo", "demo")
    return IntakePage(driver).wait_until_loaded()

@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item, call):
    report = yield
    if report.when == "call" and report.failed:
        driver = item.funcargs.get("driver")
        if driver is not None:
            folder = item.config.rootpath / "screenshots"
            folder.mkdir(exist_ok=True)
            driver.save_screenshot(str(folder / f"{item.name}.png"))
    return report
