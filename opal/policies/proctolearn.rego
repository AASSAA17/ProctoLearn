package proctolearn.authz

default allow = false

# user_roles comes из OPA data: data.proctolearn.users[<userId>].roles
user_roles := object.get(object.get(data.proctolearn.users, input.user_id, {}), "roles", [])

has_role(role) {
  user_roles[_] == role
}

# ADMIN может всё
allow {
  has_role("ADMIN")
}

# STUDENT: только собственные попытки и базовые student-эндпоинты
allow {
  has_role("STUDENT")
  startswith(input.path, "/attempts")
  input.action == "submit"
  input.resource_owner_id == input.user_id
}

allow {
  has_role("STUDENT")
  startswith(input.path, "/courses")
  input.action == "read"
}

# TEACHER: управление курсами/экзаменами, где он владелец
allow {
  has_role("TEACHER")
  startswith(input.path, "/courses")
  input.action == "manage"
  input.resource_owner_id == input.user_id
}

allow {
  has_role("TEACHER")
  startswith(input.path, "/exams")
  input.action == "manage"
  input.resource_owner_id == input.user_id
}

# PROCTOR: просмотр сессий, evidence, flag attempt
allow {
  has_role("PROCTOR")
  startswith(input.path, "/proctor")
  input.action == "read"
}

allow {
  has_role("PROCTOR")
  input.path == "/attempts/flag"
  input.action == "flag"
}
