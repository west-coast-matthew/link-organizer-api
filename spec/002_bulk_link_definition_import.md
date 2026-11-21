status: completed

# 002 — bulk link definition import (api)

We need to support the ability to upload links in bulk as I have a lot of files I need to import. 

Data will be supplied in the format: link title, link, and optional description, with each definition occurring on a series of consecutive lines, and each set of related data separated by a space. The following is an example:

```
link 1
http://www.somewhere.com

some other link
http://www.foo.com
this is a really great site....
```
# Tasks
* implement new api call which will accept the information. This will probably come from a text area, and not the result of a file upload. Call will need to accept the category/subcategory for which all entries will be associated with.