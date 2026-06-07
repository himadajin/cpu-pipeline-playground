#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
readonly repo_root="$(cd -- "${script_dir}/.." && pwd)"
readonly image_tag="${ORACLE_DOCKER_IMAGE:-cpu-pipeline-playground-oracle:2026-06-07}"

# Script interface

usage() {
  local fd=${1:-1}
  local command_name=${0##*/}
  local red=''
  local cyan=''
  local yellow=''
  local reset=''

  if color_enabled "${fd}"; then
    red=$'\033[31m'
    cyan=$'\033[36m'
    yellow=$'\033[33m'
    reset=$'\033[0m'
  fi

  cat >&"${fd}" <<EOF
Run a command inside the oracle Docker image.

${cyan}Usage:${reset}
  ${command_name} <command>...

${cyan}Arguments:${reset}
  ${cyan}<command>...${reset}  Command and arguments to run in the container.

${cyan}Options:${reset}
  ${cyan}-h, --help${reset}  Show this help message.

${cyan}Environment:${reset}
  ${cyan}ORACLE_DOCKER_IMAGE${reset}  Docker image tag to build and run.

${cyan}Examples:${reset}
  ${command_name} riscv-none-elf-gcc --version
  ${command_name} qemu-system-riscv32 --version
EOF
}

die() {
  local message=$1
  local code=${2:-1}
  local red=''
  local reset=''

  if color_enabled 2; then
    red=$'\033[31m'
    reset=$'\033[0m'
  fi

  printf '%sError:%s %s\n' "${red}" "${reset}" "${message}" >&2
  exit "${code}"
}

color_enabled() {
  local fd=${1:-1}
  [[ -t "${fd}" && -z "${NO_COLOR:-}" ]]
}

validate() {
  command -v docker >/dev/null 2>&1 || die "required command not found: docker; install Docker and retry" 127
  [[ $# -ge 1 ]] || die "missing command; pass <command> or use --help for usage" 2
}

# Task functions

ensure_image() {
  docker build -t "${image_tag}" "${script_dir}" >&2
}

run_in_container() {
  docker run --rm \
    --volume "${repo_root}:${repo_root}" \
    --workdir "${repo_root}" \
    "${image_tag}" \
    "$@"
}

# Entry point

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  validate "$@"
  ensure_image
  run_in_container "$@"
}

main "$@"
