
docs/index.html: cc-database.yaml build_cc_webpage.py
	python3 build_cc_webpage.py --html $< > $@
