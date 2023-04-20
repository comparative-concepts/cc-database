
docs/index.html: cc-database.yaml build-cc-webpage.py
	python3 build-cc-webpage.py $< > $@
