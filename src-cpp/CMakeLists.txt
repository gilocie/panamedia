cmake_minimum_required(VERSION 3.20)
project(panamedia-core CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

# Fetch nlohmann/json
include(FetchContent)
FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_MakeAvailable(json)

file(GLOB SOURCES "src/*.cpp")

add_executable(panamedia-core ${SOURCES})
# ws2_32: Winsock, for the HTTP bridge.
# advapi32 was linked for the shutdown privilege. That code is gone and must not
# come back -- see ConversionSupport::systemPowerAction.
target_link_libraries(panamedia-core PRIVATE nlohmann_json::nlohmann_json ws2_32)

# ---------------------------------------------------------------------------
# FFmpeg (optional)
#
# Needed by the native playback engine: demuxing, decoding, and audio output.
# Conversion still shells out to the ffmpeg binary, so the engine builds and
# runs without this -- it just falls back to streaming bytes over HTTP.
#
# OFF by default on purpose. Turning it on when nothing includes <libavcodec.h>
# would add four DLL loads to every launch for no benefit, and would make a
# missing FFmpeg a build failure instead of a feature that stays off.
#
# Windows setup:
#   1. Download a *shared* GPL build, e.g.
#      https://github.com/BtbN/FFmpeg-Builds/releases/latest
#      -> ffmpeg-n8.1-latest-win64-gpl-shared-8.1.zip
#      GPL, not LGPL: the LGPL builds omit libx264/libx265.
#   2. Unzip somewhere permanent, e.g. C:\ffmpeg-dev
#   3. cmake -S src-cpp -B src-cpp/build -DPANAMEDIA_WITH_FFMPEG=ON -DFFMPEG_ROOT=C:/ffmpeg-dev
#
# The DLLs are copied next to the executable automatically -- a shared build
# resolves them at load time, so an exe without them next to it will not start.
# ---------------------------------------------------------------------------
option(PANAMEDIA_WITH_FFMPEG "Link the native FFmpeg libraries (playback engine)" OFF)

if(PANAMEDIA_WITH_FFMPEG)
    if(NOT FFMPEG_ROOT AND DEFINED ENV{FFMPEG_ROOT})
        set(FFMPEG_ROOT "$ENV{FFMPEG_ROOT}")
    endif()
    if(NOT FFMPEG_ROOT)
        message(FATAL_ERROR
            "PANAMEDIA_WITH_FFMPEG=ON but FFMPEG_ROOT was not given. "
            "Point it at an unpacked FFmpeg shared build, e.g. -DFFMPEG_ROOT=C:/ffmpeg-dev")
    endif()

    set(FFMPEG_COMPONENTS avcodec avformat avutil swresample swscale)
    set(FFMPEG_INCLUDE_DIRS "")
    set(FFMPEG_LIBRARIES "")
    set(FFMPEG_MISSING "")

    foreach(comp IN LISTS FFMPEG_COMPONENTS)
        find_path(FFMPEG_INCLUDE_${comp}
            NAMES "lib${comp}/${comp}.h"
            HINTS "${FFMPEG_ROOT}/include"
            NO_DEFAULT_PATH)
        find_library(FFMPEG_LIB_${comp}
            NAMES "${comp}"
            HINTS "${FFMPEG_ROOT}/lib"
            NO_DEFAULT_PATH)

        if(FFMPEG_INCLUDE_${comp})
            list(APPEND FFMPEG_INCLUDE_DIRS "${FFMPEG_INCLUDE_${comp}}")
        else()
            list(APPEND FFMPEG_MISSING "lib${comp}/${comp}.h")
        endif()
        if(FFMPEG_LIB_${comp})
            list(APPEND FFMPEG_LIBRARIES "${FFMPEG_LIB_${comp}}")
        else()
            list(APPEND FFMPEG_MISSING "${comp}.lib")
        endif()
    endforeach()

    if(FFMPEG_MISSING)
        message(FATAL_ERROR
            "FFmpeg at ${FFMPEG_ROOT} is missing: ${FFMPEG_MISSING}\n"
            "Expected layout: ${FFMPEG_ROOT}/include/lib<name>/, ${FFMPEG_ROOT}/lib/, ${FFMPEG_ROOT}/bin/")
    endif()

    message(STATUS "FFmpeg root:    ${FFMPEG_ROOT}")
    message(STATUS "FFmpeg headers: ${FFMPEG_INCLUDE_DIRS}")
    message(STATUS "FFmpeg libs:    ${FFMPEG_LIBRARIES}")

    target_include_directories(panamedia-core PRIVATE ${FFMPEG_INCLUDE_DIRS})
    target_link_libraries(panamedia-core PRIVATE ${FFMPEG_LIBRARIES})
    target_compile_definitions(panamedia-core PRIVATE PANAMEDIA_WITH_FFMPEG=1)

    # Statically-named DLLs, because Windows resolves the plain name at load time.
    # Globbed rather than listed by version: the soname suffix (avcodec-61 vs
    # -62) changes with every FFmpeg release, and a hardcoded list would fail
    # the build on the next upgrade instead of just working.
    file(GLOB FFMPEG_DLLS "${FFMPEG_ROOT}/bin/av*.dll" "${FFMPEG_ROOT}/bin/sw*.dll")
    if(NOT FFMPEG_DLLS)
        message(FATAL_ERROR "No FFmpeg DLLs found in ${FFMPEG_ROOT}/bin -- is this a shared build?")
    endif()
    message(STATUS "FFmpeg DLLs:    ${FFMPEG_DLLS}")

    add_custom_command(TARGET panamedia-core POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${FFMPEG_DLLS}
                "$<TARGET_FILE_DIR:panamedia-core>"
        COMMENT "Copying FFmpeg runtime DLLs next to panamedia-core.exe")
endif()

set_target_properties(panamedia-core PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/bin/Release"
)
