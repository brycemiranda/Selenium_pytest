import sys
import xml.etree.ElementTree as ET

results_file = sys.argv[1]
expected = {sys.argv[2]} if sys.argv[2] else set()

failed, skipped, passed = set(), set(), set()
for case in ET.parse(results_file).iter("testcase"):
    name = case.get("name")
    if case.find("failure") is not None or case.find("error") is not None:
        failed.add(name)
    elif case.find("skipped") is not None:
        skipped.add(name)
    else:
        passed.add(name)

print("passed: ", sorted(passed))
print("failed: ", sorted(failed))
print("expected to fail:", sorted(expected))

if skipped:
    sys.exit(f"FAIL: tests were skipped: {sorted(skipped)}")
if not passed:
    sys.exit("FAIL: no tests passed, something is broken beyond the bug")
if failed != expected:
    sys.exit(f"FAIL: expected {sorted(expected)} to fail, but got {sorted(failed)}")
print("OK: exactly the expected tests failed")
