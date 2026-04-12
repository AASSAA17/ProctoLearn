import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def jenkins = Jenkins.get()
def jobName = 'ProctoLearn-Pipeline'
def jenkinsfilePath = '/var/jenkins_home/proctolearn/Jenkinsfile'
def jenkinsfile = new File(jenkinsfilePath)

if (!jenkinsfile.exists()) {
  println("[init] Jenkinsfile not found at ${jenkinsfilePath}, skipping job creation.")
  return
}

def script = jenkinsfile.text
def job = jenkins.getItem(jobName)

if (job == null) {
  job = jenkins.createProject(WorkflowJob, jobName)
  println("[init] Created Jenkins pipeline job: ${jobName}")
} else {
  println("[init] Updating Jenkins pipeline job: ${jobName}")
}

job.setDefinition(new CpsFlowDefinition(script, true))
job.setDescription('Auto-created from mounted Jenkinsfile in /var/jenkins_home/proctolearn')
job.save()
jenkins.save()
