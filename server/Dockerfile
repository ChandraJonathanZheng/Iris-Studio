# Iris Studio API — .NET 10. Build context: the server/ folder.
#   docker build -t iris-api server
#   docker run -p 8080:8080 --env-file server/.env iris-api
#
# Stage 1 has the full SDK (big) to compile; stage 2 only has the runtime (small), so the image we ship is lean.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Restore first, on its own layer: package downloads are cached until the .csproj changes.
COPY IrisStudio.Api/IrisStudio.Api.csproj IrisStudio.Api/
RUN dotnet restore IrisStudio.Api/IrisStudio.Api.csproj
COPY IrisStudio.Api/ IrisStudio.Api/
RUN dotnet publish IrisStudio.Api/IrisStudio.Api.csproj -c Release -o /app --no-restore

# The regular (Debian) runtime image includes ICU, which the app needs for zh-TW dates (InvariantGlobalization=false).
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
# Hosts like Render/Railway tell the app which port to use through $PORT; fall back to 8080.
EXPOSE 8080
CMD ["sh", "-c", "ASPNETCORE_HTTP_PORTS=${PORT:-8080} exec dotnet IrisStudio.Api.dll"]
