status: completed

# 001 — implement support for site thumbnail generation

We need to add the ability to generate thumbnails and store them for link definitions. The location for the thumbnails will be defined in a new properties file. When link definitions are added, we will need to attempt to generate a thumbnail of the site.

## Tasks
* install the open-graph-scraper and sharp libraries
* update the example env file with the new property
* create a new directory /etc/app-properties/link-mgmnt/data/thumbnails
* add that property to the env file located under /etc/app-properties/link-mgmnt with the new above directory as the value
* modify the create link api to call the service and generate the associated thumbnail.
* establish a new api that will service requests to retrieve thumbnail images which will be served from the defined directory external to the project
