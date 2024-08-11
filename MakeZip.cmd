@echo off
del extension%1.zip
"%ProgramFiles%\7-Zip\7z" a -x@MakeZipExclude.txt extension%1.zip * -r