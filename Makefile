.PHONY: setup validate build init up down status logs check test smoke backup
setup validate build init up down status logs check backup:
	python3 scripts/stack.py $@
test:
	python3 -m unittest discover -s tests -v
smoke:
	python3 scripts/smoke.py
