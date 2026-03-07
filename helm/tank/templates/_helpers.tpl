{{/*
Expand the name of the chart.
*/}}
{{- define "tank.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "tank.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "tank.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "tank.labels" -}}
helm.sh/chart: {{ include "tank.chart" . }}
{{ include "tank.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "tank.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tank.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Web component labels
*/}}
{{- define "tank.web.labels" -}}
{{ include "tank.labels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "tank.web.selectorLabels" -}}
{{ include "tank.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Scanner component labels
*/}}
{{- define "tank.scanner.labels" -}}
{{ include "tank.labels" . }}
app.kubernetes.io/component: scanner
{{- end }}

{{/*
Scanner selector labels
*/}}
{{- define "tank.scanner.selectorLabels" -}}
{{ include "tank.selectorLabels" . }}
app.kubernetes.io/component: scanner
{{- end }}

{{/*
Ollama component labels
*/}}
{{- define "tank.ollama.labels" -}}
{{ include "tank.labels" . }}
app.kubernetes.io/component: ollama
{{- end }}

{{/*
Ollama selector labels
*/}}
{{- define "tank.ollama.selectorLabels" -}}
{{ include "tank.selectorLabels" . }}
app.kubernetes.io/component: ollama
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "tank.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tank.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Construct the DATABASE_URL from components.
*/}}
{{- define "tank.databaseUrl" -}}
{{- $host := include "tank.postgresHost" . -}}
{{- printf "postgresql://%s:%s@%s:%s/%s" (.Values.global.postgresql.auth.username | urlquery) (.Values.global.postgresql.auth.password | urlquery) $host (toString .Values.global.postgresql.port) .Values.global.postgresql.auth.database }}
{{- end }}

{{/*
Determine PostgreSQL host.
If postgresql subchart is enabled, use the subchart service name.
Otherwise, use the external host.
*/}}
{{- define "tank.postgresHost" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" .Release.Name }}
{{- else }}
{{- .Values.global.postgresql.externalHost }}
{{- end }}
{{- end }}

{{/*
Construct the REDIS_URL.
*/}}
{{- define "tank.redisUrl" -}}
{{- $host := include "tank.redisHost" . -}}
{{- if .Values.global.redis.auth.password }}
{{- printf "redis://:%s@%s:%s" (.Values.global.redis.auth.password | urlquery) $host (toString .Values.global.redis.port) }}
{{- else }}
{{- printf "redis://%s:%s" $host (toString .Values.global.redis.port) }}
{{- end }}
{{- end }}

{{/*
Determine Redis host.
*/}}
{{- define "tank.redisHost" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" .Release.Name }}
{{- else }}
{{- .Values.global.redis.externalHost }}
{{- end }}
{{- end }}

{{/*
Construct the S3 endpoint URL.
*/}}
{{- define "tank.s3Endpoint" -}}
{{- if .Values.minio.enabled }}
{{- printf "http://%s-minio:9000" .Release.Name }}
{{- else }}
{{- .Values.global.storage.s3.endpoint }}
{{- end }}
{{- end }}

{{/*
Construct the internal Python scanner URL.
*/}}
{{- define "tank.scannerUrl" -}}
{{- printf "http://%s-scanner:%s" (include "tank.fullname" .) (toString .Values.scanner.service.port) }}
{{- end }}

{{/*
Name for the shared configmap.
*/}}
{{- define "tank.sharedConfigmapName" -}}
{{- printf "%s-shared" (include "tank.fullname" .) }}
{{- end }}

{{/*
Name for the web configmap.
*/}}
{{- define "tank.webConfigmapName" -}}
{{- printf "%s-web" (include "tank.fullname" .) }}
{{- end }}

{{/*
Name for the scanner configmap.
*/}}
{{- define "tank.scannerConfigmapName" -}}
{{- printf "%s-scanner" (include "tank.fullname" .) }}
{{- end }}

{{/*
Name for the secret.
*/}}
{{- define "tank.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "tank.fullname" .) }}
{{- end }}
{{- end }}
