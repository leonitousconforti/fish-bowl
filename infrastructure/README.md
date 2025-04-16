## Infrastructure

## Why only docker?

My initial idea included support for running on any system, local or via ssh. But doing that made the project turn into a nodejs wrapper for a bunch of shell commands and the functionality wasn't honestly needed. This package will mostly be used by other packages in their test suites, and so putting restriction on where this can run was perfectly fine by me. If I really wanted to, I could always just change a url and have the test suites for those packages point to a different emulator temporarily, either locally or on the network, that I would manually bring up with android studio. In the end, it just made more sense to limit where architect can run.

## Infrastructure

1. Install ubuntu 22.04 DESKTOP. You must install ubuntu desktop unless you want to wrangle your own xserver install. You can do the minimal installation, but make sure to check 'with additional drivers' for your discrete gpu. After the install finishes, you can update packages but don't run auto-remove or purge anything.
2. Follow <https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository> to install docker
3. Follow <https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html> to install the nvidia container toolkit
4. You can check if your docker installation can find your nvidia gpus with: `docker run --rm --gpus all nvidia/cuda:12.2.0-devel-ubuntu20.04 nvidia-smi`
5. You might need to make your xserver is accessible to docker, I just use `xhost +local:<username>`

## Why are only google apis and play store images supported?

Note to self, from https://android-developers.googleblog.com/2020/03/run-arm-apps-on-android-emulator.html

"_Note that the ARM to x86 translation technology enables the execution of intellectual property owned by Arm Limited. It will only be available on Google APIs and Play Store system images, and can only be used for application development and debug purposes on x86 desktop, laptop, customer on-premises servers, and customer-procured cloud-based environments. The technology should not be used in the provision of commercial hosted services._"
