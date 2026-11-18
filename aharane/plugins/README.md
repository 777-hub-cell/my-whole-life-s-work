# Shared plugins

Plugins and reusable functionality belong here. This directory is shared by the
public and private command registries; do not duplicate a plugin under either
command directory. A command may import a shared plugin from this directory.
Any plugin entry point that handles messages, events, HTTP requests, or scheduled
work directly must still enforce its intended public/private authorization scope.
