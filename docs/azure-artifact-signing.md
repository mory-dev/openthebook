# Azure Artifact Signing for OpenTheBook

This setup connects the `mory-dev/openthebook` GitHub Actions `release`
environment to Azure Artifact Signing. The release workflow signs the Windows
installer with a Microsoft-managed certificate; no `.pfx` file or private
certificate key is stored in GitHub.

## 1. Create the Azure signing resources

In the Azure portal:

1. Register the `Microsoft.CodeSigning` resource provider for the subscription.
2. Create an **Artifact Signing account** in a supported region. Suggested names:
   - Resource group: `rg-openthebook-signing`
   - Account: `openthebook-signing`
   - Region: `East US`
   - SKU: `Basic`
3. Open the account's **Identity validations** blade and create a **Public**
   validation for the legal individual or organization that should appear as
   the signer. Complete the verification email and any identity checks.
4. After validation is completed, create a **Public Trust** certificate profile:
   - Profile name: `openthebook-public`
   - Verified identity: the completed identity validation

Do not choose **Public Trust Test** for a public release. Test certificates are
not publicly trusted. Public identity validation may require business or
identity documents and can take time to complete.

The account region determines the endpoint used by GitHub Actions:

| Region | `AZURE_ENDPOINT` |
| --- | --- |
| East US | `https://eus.codesigning.azure.net/` |
| Central US | `https://cus.codesigning.azure.net/` |
| North Europe | `https://neu.codesigning.azure.net/` |
| Japan East | `https://jpe.codesigning.azure.net/` |

Use the endpoint that matches the region of the account.

## 2. Create the GitHub-to-Azure identity

Create a Microsoft Entra app registration named `openthebook-github-release`,
then create its service principal. Record these values:

- Application (client) ID
- Directory (tenant) ID
- Azure subscription ID

Add the federated credential from
[`github-openthebook-release-federated-credential.json`](../infra/azure/github-openthebook-release-federated-credential.json).
In the portal, this is **App registrations → the app → Certificates & secrets
→ Federated credentials → Add credential → GitHub Actions → Environment** with:

- Organization: `mory-dev`
- Repository: `openthebook`
- Environment: `release`

The workflow currently presents this subject to Azure:

```text
repo:mory-dev@65853356/openthebook@1352466162:environment:release
```

CLI alternative after installing Azure CLI and logging in:

```powershell
az login
az account set --subscription "<SUBSCRIPTION_ID>"

$appId = az ad app create --display-name "openthebook-github-release" --query appId -o tsv
az ad sp create --id $appId
$appObjectId = az ad app show --id $appId --query id -o tsv
az ad app federated-credential create `
  --id $appObjectId `
  --parameters infra/azure/github-openthebook-release-federated-credential.json

Write-Output "AZURE_CLIENT_ID=$appId"
Write-Output "AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
Write-Output "AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)"
```

## 3. Give the app permission to sign

On the certificate profile's **Access control (IAM)** page, add this role to
the app's service principal:

```text
Artifact Signing Certificate Profile Signer
```

Assign it at the certificate-profile scope. The service principal must be
selected as a service principal, not as a regular user.

CLI alternative:

```powershell
$resourceGroup = "rg-openthebook-signing"
$accountName = "openthebook-signing"
$profileName = "openthebook-public"
$spObjectId = az ad sp show --id $appId --query id -o tsv
$profileId = az resource show `
  --resource-group $resourceGroup `
  --resource-type Microsoft.CodeSigning/codeSigningAccounts/certificateProfiles `
  --name "$accountName/$profileName" `
  --query id -o tsv

az role assignment create `
  --assignee-object-id $spObjectId `
  --assignee-principal-type ServicePrincipal `
  --role "Artifact Signing Certificate Profile Signer" `
  --scope $profileId
```

## 4. Add the GitHub values

The release workflow expects these repository secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_ACCOUNT_NAME
AZURE_CERT_PROFILE_NAME
```

It also needs these existing release secrets for Tauri updater signing and
Cloudflare deployment:

```text
TAURI_SIGNING_PRIVATE_KEY
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional when the private key is
unencrypted. If you use an encrypted Tauri key, add that password as a GitHub
secret as well; never commit either value.

Set the region endpoint as an environment variable named `AZURE_ENDPOINT`.
The repository already has a `release` environment in the workflow; create
that environment in **Repository settings → Environments** if GitHub has not
created it yet.

From PowerShell, `gh secret set NAME` reads the value securely from stdin:

```powershell
"<CLIENT_ID>" | gh secret set AZURE_CLIENT_ID --repo mory-dev/openthebook
"<TENANT_ID>" | gh secret set AZURE_TENANT_ID --repo mory-dev/openthebook
"<SUBSCRIPTION_ID>" | gh secret set AZURE_SUBSCRIPTION_ID --repo mory-dev/openthebook
"openthebook-signing" | gh secret set AZURE_ACCOUNT_NAME --repo mory-dev/openthebook
"openthebook-public" | gh secret set AZURE_CERT_PROFILE_NAME --repo mory-dev/openthebook

gh variable set AZURE_ENDPOINT `
  --env release `
  --repo mory-dev/openthebook `
  --body "https://eus.codesigning.azure.net/"
```

Replace the endpoint if a different Azure region was selected.

## 5. Run and verify a release

After identity validation is completed, role assignment is visible, and all
secrets are present:

```powershell
gh workflow run release.yml `
  --repo mory-dev/openthebook `
  --ref master `
  --field version=0.1.0
gh run list --repo mory-dev/openthebook --workflow release.yml
```

A successful run creates a GitHub release containing the Windows installer,
Linux AppImage, Linux `.deb`, signatures, and checksums. It also publishes
`public/updates/latest.json`, which the desktop updater reads.

The Windows installer should show a valid Authenticode signature from the
validated identity in Windows Explorer → Properties → Digital Signatures.
