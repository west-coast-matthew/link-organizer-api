this will be an typescript node project that will service requests from 


## tasks
* initialize this project as an typescript based node project
* add support for type orm and mariadb
* install express
* create the apis based on the json contracts defined in the ../link-organizer-api project. that project contains json payload examples under the ./mock-data directory, and the ./service directory contains the entrypoints used by the application to perform the actual api calls
* create persistent entities based on the types defined in the ./types folder
* install the dotenv dependency
* create a startup script under a new bin directory called 'startup.sh', configure it to launch and use the dotenv property file located under '/etc/app-configs/link-mgmnt '
* create an example dotenv file within this project directory