import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy

def jenkins = Jenkins.get()
def adminId = System.getenv('JENKINS_ADMIN_ID') ?: 'admin'
def adminPassword = System.getenv('JENKINS_ADMIN_PASSWORD')
if (!adminPassword || adminPassword.length() < 16) {
  throw new IllegalStateException('JENKINS_ADMIN_PASSWORD must contain at least 16 characters')
}
def adminEmail = System.getenv('JENKINS_ADMIN_EMAIL') ?: 'admin@proctolearn.local'

def securityRealm = new HudsonPrivateSecurityRealm(false)
securityRealm.createAccount(adminId, adminPassword)
jenkins.setSecurityRealm(securityRealm)

def authorizationStrategy = new FullControlOnceLoggedInAuthorizationStrategy()
authorizationStrategy.setAllowAnonymousRead(false)
jenkins.setAuthorizationStrategy(authorizationStrategy)
jenkins.setCrumbIssuer(new hudson.security.csrf.DefaultCrumbIssuer(true))
JenkinsLocationConfiguration.get().setAdminAddress(adminEmail)
jenkins.save()
