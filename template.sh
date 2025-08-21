#!/bin/bash

# creating directories for a project structure
mkdir -p src
mkdir -p research

#creating files in the directories
touch src/__init__.py
touch src/helper.py
touch src/prompt.py
touch .env
touch setup.py
touch app.py
touch research/trials.ipynb
touch requirements.txt

echo "Project structure created successfully."
