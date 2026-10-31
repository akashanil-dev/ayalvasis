.PHONY: setup validate build init up down status logs check backup
setup validate build init up down status logs check backup:
	python3 scripts/stack.py $@
